/**
 * OAuth Proxy Service
 *
 * Manages OAuth proxy sessions for external instances authenticating
 * through production's shared OAuth client.
 */

import pg from 'pg';
import { createServiceLogger, decryptSecret, encryptSecret } from '@orient/core';

const { Pool } = pg;
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
  createdAt: Date;
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
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    const dbUrl =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }

  /**
   * Create a new pending OAuth proxy session
   */
  async createSession(input: CreateSessionInput): Promise<OAuthProxySession> {
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

    const result = await this.pool.query(
      `INSERT INTO oauth_proxy_sessions (session_id, code_challenge, scopes, status, expires_at)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id, session_id, code_challenge, scopes, status, user_email, created_at, expires_at`,
      [input.sessionId, input.codeChallenge, input.scopes, expiresAt]
    );

    const row = result.rows[0];
    logger.info('Created OAuth proxy session', { sessionId: input.sessionId });

    return this.rowToSession(row);
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<OAuthProxySession | null> {
    const result = await this.pool.query(
      `SELECT id, session_id, code_challenge, scopes, status, user_email, created_at, expires_at
       FROM oauth_proxy_sessions
       WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToSession(result.rows[0]);
  }

  /**
   * Complete a session by storing encrypted tokens
   */
  async completeSession(input: CompleteSessionInput): Promise<boolean> {
    // Encrypt the tokens JSON
    const tokensJson = JSON.stringify(input.tokens);
    const { encrypted, iv, authTag } = encryptSecret(tokensJson);
    const encryptedTokens = JSON.stringify({ encrypted, iv, authTag });

    const result = await this.pool.query(
      `UPDATE oauth_proxy_sessions
       SET status = 'completed',
           encrypted_tokens = $2,
           user_email = $3
       WHERE session_id = $1 AND status = 'pending' AND expires_at > NOW()
       RETURNING id`,
      [input.sessionId, encryptedTokens, input.tokens.email]
    );

    if (result.rows.length === 0) {
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
    // First get the session to validate PKCE
    const sessionResult = await this.pool.query(
      `SELECT id, code_challenge, encrypted_tokens, status, expires_at
       FROM oauth_proxy_sessions
       WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      logger.warn('Session not found for token retrieval', { sessionId });
      return null;
    }

    const session = sessionResult.rows[0];

    // Check status
    if (session.status !== 'completed') {
      logger.warn('Session not in completed status', {
        sessionId,
        status: session.status,
      });
      return null;
    }

    // Check expiration
    if (new Date(session.expires_at) < new Date()) {
      logger.warn('Session expired', { sessionId });
      return null;
    }

    // Validate PKCE code verifier
    const { createHash } = await import('crypto');
    const computedChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    if (computedChallenge !== session.code_challenge) {
      logger.warn('PKCE validation failed', { sessionId });
      return null;
    }

    // Mark as retrieved (one-time retrieval)
    await this.pool.query(
      `UPDATE oauth_proxy_sessions
       SET status = 'retrieved', encrypted_tokens = NULL
       WHERE session_id = $1`,
      [sessionId]
    );

    // Decrypt and return tokens
    const { encrypted, iv, authTag } = JSON.parse(session.encrypted_tokens);
    const tokensJson = decryptSecret(encrypted, iv, authTag);
    const tokens = JSON.parse(tokensJson) as OAuthProxyTokens;

    logger.info('Tokens retrieved successfully', { sessionId, email: tokens.email });
    return tokens;
  }

  /**
   * Check if a session is completed (for polling)
   */
  async isSessionCompleted(sessionId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT status FROM oauth_proxy_sessions
       WHERE session_id = $1 AND expires_at > NOW()`,
      [sessionId]
    );

    if (result.rows.length === 0) return false;
    return result.rows[0].status === 'completed';
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM oauth_proxy_sessions
       WHERE expires_at < NOW() OR status = 'retrieved'
       RETURNING id`
    );

    const count = result.rows.length;
    if (count > 0) {
      logger.info('Cleaned up expired OAuth proxy sessions', { count });
    }
    return count;
  }

  /**
   * Mark a session as expired
   */
  async expireSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE oauth_proxy_sessions SET status = 'expired' WHERE session_id = $1`,
      [sessionId]
    );
  }

  private rowToSession(row: any): OAuthProxySession {
    return {
      id: row.id,
      sessionId: row.session_id,
      codeChallenge: row.code_challenge,
      scopes: row.scopes,
      status: row.status as OAuthProxySessionStatus,
      userEmail: row.user_email,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
    };
  }
}

export function createOAuthProxyService(connectionString?: string): OAuthProxyService {
  return new OAuthProxyService(connectionString);
}
