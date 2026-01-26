/**
 * OAuth Proxy Service
 *
 * Manages OAuth proxy sessions for external instances authenticating
 * through production's shared OAuth client using Drizzle ORM.
 */

import { createServiceLogger, decryptSecret, encryptSecret } from '@orient/core';
import { getDatabase, eq, and, gt, lt, or, schema } from '@orient/database';
import type { Database } from '@orient/database';

const logger = createServiceLogger('oauth-proxy-service');

// Session expires after 5 minutes
const SESSION_EXPIRY_MS = 5 * 60 * 1000;

export type OAuthProxySessionStatus = 'pending' | 'completed' | 'retrieved' | 'expired';

export interface OAuthProxySession {
  id: number;
  sessionId: string;
  codeChallenge: string;
  scopes: string[];
  status: OAuthProxySessionStatus;
  userEmail: string | null;
  createdAt: Date | null;
  expiresAt: Date;
}

export interface OAuthProxyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  email: string;
}

export interface CreateSessionInput {
  sessionId: string;
  codeChallenge: string;
  scopes: string[];
}

export interface CompleteSessionInput {
  sessionId: string;
  tokens: OAuthProxyTokens;
}

export class OAuthProxyService {
  private _db: Database | null = null;

  private get db(): Database {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  private parseScopes(json: string | null): string[] {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  /**
   * Create a new pending OAuth proxy session
   */
  async createSession(input: CreateSessionInput): Promise<OAuthProxySession> {
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

    await this.db.insert(schema.oauthProxySessions).values({
      sessionId: input.sessionId,
      codeChallenge: input.codeChallenge,
      scopes: JSON.stringify(input.scopes),
      status: 'pending',
      expiresAt,
    });

    const result = await this.db
      .select()
      .from(schema.oauthProxySessions)
      .where(eq(schema.oauthProxySessions.sessionId, input.sessionId))
      .limit(1);

    logger.info('Created OAuth proxy session', { sessionId: input.sessionId });

    return this.rowToSession(result[0]);
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<OAuthProxySession | null> {
    const result = await this.db
      .select()
      .from(schema.oauthProxySessions)
      .where(eq(schema.oauthProxySessions.sessionId, sessionId))
      .limit(1);

    if (result.length === 0) return null;
    return this.rowToSession(result[0]);
  }

  /**
   * Complete a session by storing encrypted tokens
   */
  async completeSession(input: CompleteSessionInput): Promise<boolean> {
    const tokensJson = JSON.stringify(input.tokens);
    const { encrypted, iv, authTag } = encryptSecret(tokensJson);

    const result = await this.db
      .update(schema.oauthProxySessions)
      .set({
        status: 'completed',
        encryptedTokens: encrypted,
        tokensIv: iv,
        tokensAuthTag: authTag,
        userEmail: input.tokens.email,
      })
      .where(
        and(
          eq(schema.oauthProxySessions.sessionId, input.sessionId),
          eq(schema.oauthProxySessions.status, 'pending'),
          gt(schema.oauthProxySessions.expiresAt, new Date())
        )
      )
      .returning({ id: schema.oauthProxySessions.id });

    if (result.length === 0) {
      logger.warn('Failed to complete session - not found or expired', {
        sessionId: input.sessionId,
      });
      return false;
    }

    logger.info('Completed OAuth proxy session', {
      sessionId: input.sessionId,
      email: input.tokens.email,
    });
    return true;
  }

  /**
   * Retrieve tokens for a completed session (one-time retrieval)
   * Validates PKCE code verifier matches the stored challenge
   */
  async getTokens(sessionId: string, codeVerifier: string): Promise<OAuthProxyTokens | null> {
    const result = await this.db
      .select()
      .from(schema.oauthProxySessions)
      .where(eq(schema.oauthProxySessions.sessionId, sessionId))
      .limit(1);

    if (result.length === 0) {
      logger.warn('Session not found for token retrieval', { sessionId });
      return null;
    }

    const session = result[0];

    if (session.status !== 'completed') {
      logger.warn('Session not in completed status', {
        sessionId,
        status: session.status,
      });
      return null;
    }

    if (session.expiresAt < new Date()) {
      logger.warn('Session expired', { sessionId });
      return null;
    }

    // Validate PKCE code verifier
    const { createHash } = await import('crypto');
    const computedChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    if (computedChallenge !== session.codeChallenge) {
      logger.warn('PKCE validation failed', { sessionId });
      return null;
    }

    // Mark as retrieved (one-time retrieval)
    await this.db
      .update(schema.oauthProxySessions)
      .set({
        status: 'retrieved',
        encryptedTokens: null,
        tokensIv: null,
        tokensAuthTag: null,
      })
      .where(eq(schema.oauthProxySessions.sessionId, sessionId));

    // Decrypt and return tokens
    if (!session.encryptedTokens || !session.tokensIv || !session.tokensAuthTag) {
      logger.warn('No tokens found in session', { sessionId });
      return null;
    }

    const tokensJson = decryptSecret(
      session.encryptedTokens,
      session.tokensIv,
      session.tokensAuthTag
    );
    const tokens = JSON.parse(tokensJson) as OAuthProxyTokens;

    logger.info('Tokens retrieved successfully', { sessionId, email: tokens.email });
    return tokens;
  }

  /**
   * Check if a session is completed (for polling)
   */
  async isSessionCompleted(sessionId: string): Promise<boolean> {
    const result = await this.db
      .select({ status: schema.oauthProxySessions.status })
      .from(schema.oauthProxySessions)
      .where(
        and(
          eq(schema.oauthProxySessions.sessionId, sessionId),
          gt(schema.oauthProxySessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (result.length === 0) return false;
    return result[0].status === 'completed';
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.db
      .delete(schema.oauthProxySessions)
      .where(
        or(
          lt(schema.oauthProxySessions.expiresAt, new Date()),
          eq(schema.oauthProxySessions.status, 'retrieved')
        )
      )
      .returning({ id: schema.oauthProxySessions.id });

    const count = result.length;
    if (count > 0) {
      logger.info('Cleaned up expired OAuth proxy sessions', { count });
    }
    return count;
  }

  /**
   * Mark a session as expired
   */
  async expireSession(sessionId: string): Promise<void> {
    await this.db
      .update(schema.oauthProxySessions)
      .set({ status: 'expired' })
      .where(eq(schema.oauthProxySessions.sessionId, sessionId));
  }

  private rowToSession(row: typeof schema.oauthProxySessions.$inferSelect): OAuthProxySession {
    return {
      id: row.id,
      sessionId: row.sessionId,
      codeChallenge: row.codeChallenge,
      scopes: this.parseScopes(row.scopes),
      status: row.status as OAuthProxySessionStatus,
      userEmail: row.userEmail,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }
}

export function createOAuthProxyService(): OAuthProxyService {
  return new OAuthProxyService();
}
