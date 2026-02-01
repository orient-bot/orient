/**
 * Google OAuth Proxy Client
 *
 * Local client for proxy-mode OAuth. Allows external instances to authenticate
 * with Google using Orient's shared OAuth client without exposing the client secret.
 *
 * Architecture:
 * - Local instance generates session ID and PKCE code verifier
 * - Sends code challenge (not verifier) to production
 * - Production handles Google OAuth flow
 * - Local polls production for tokens after user completes consent
 * - Token refresh goes through production (requires client secret)
 */

import crypto from 'crypto';
import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('google-oauth-proxy');

// =============================================================================
// Types
// =============================================================================

export interface ProxyOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  email: string;
}

export interface ProxyStartResponse {
  success: boolean;
  authUrl?: string;
  sessionId?: string;
  error?: string;
}

export interface ProxyTokensResponse {
  success: boolean;
  tokens?: ProxyOAuthTokens;
  status?: 'pending' | 'completed' | 'expired';
  error?: string;
}

export interface ProxyRefreshResponse {
  success: boolean;
  accessToken?: string;
  expiresAt?: number;
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const POLL_INTERVAL_MS = 2000; // 2 seconds
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REFRESH_RETRIES = 3;

// =============================================================================
// Proxy Mode Detection
// =============================================================================

/**
 * Check if OAuth proxy mode is enabled.
 * Proxy mode is active when GOOGLE_OAUTH_PROXY_URL is set and
 * local OAuth credentials are NOT configured.
 */
export function isProxyModeEnabled(): boolean {
  const proxyUrl = process.env.GOOGLE_OAUTH_PROXY_URL;
  const hasLocalCredentials =
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  // Only use proxy mode if URL is set AND no local credentials
  return !!proxyUrl && !hasLocalCredentials;
}

/**
 * Get the proxy server URL from environment.
 */
export function getProxyUrl(): string | null {
  return process.env.GOOGLE_OAUTH_PROXY_URL || null;
}

// =============================================================================
// GoogleOAuthProxyClient Class
// =============================================================================

export class GoogleOAuthProxyClient {
  private proxyBaseUrl: string;
  private pendingSession: {
    sessionId: string;
    codeVerifier: string;
    scopes: string[];
  } | null = null;

  constructor(proxyUrl?: string) {
    const url = proxyUrl || process.env.GOOGLE_OAUTH_PROXY_URL;
    if (!url) {
      throw new Error('GOOGLE_OAUTH_PROXY_URL is not configured');
    }
    // Remove trailing slash if present
    this.proxyBaseUrl = url.replace(/\/$/, '');
    logger.info('GoogleOAuthProxyClient initialized', { proxyUrl: this.proxyBaseUrl });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Start the OAuth flow through the proxy.
   * Generates session ID and PKCE locally, sends challenge to production.
   */
  async startOAuthFlow(
    scopes: string[]
  ): Promise<{ authUrl: string; sessionId: string; state: string }> {
    const op = logger.startOperation('startOAuthFlow');

    // Generate session ID
    const sessionId = crypto.randomBytes(32).toString('hex');

    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    // Store pending session locally (verifier stays local for security)
    this.pendingSession = {
      sessionId,
      codeVerifier,
      scopes,
    };

    try {
      // Call production /api/oauth/proxy/start
      const response = await fetch(`${this.proxyBaseUrl}/api/oauth/proxy/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          codeChallenge,
          scopes,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy start failed: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as ProxyStartResponse;

      if (!data.success || !data.authUrl) {
        throw new Error(data.error || 'Failed to get auth URL from proxy');
      }

      op.success('OAuth flow started through proxy', { sessionId });

      return {
        authUrl: data.authUrl,
        sessionId,
        state: sessionId, // Use sessionId as state for compatibility
      };
    } catch (error) {
      this.pendingSession = null;
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Poll production for tokens after user completes OAuth consent.
   * Returns tokens once available or throws after timeout.
   */
  async pollForTokens(sessionId?: string): Promise<ProxyOAuthTokens> {
    const op = logger.startOperation('pollForTokens');

    const session = sessionId
      ? this.pendingSession?.sessionId === sessionId
        ? this.pendingSession
        : null
      : this.pendingSession;

    if (!session) {
      throw new Error('No pending OAuth session. Call startOAuthFlow first.');
    }

    const startTime = Date.now();

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      try {
        const response = await fetch(
          `${this.proxyBaseUrl}/api/oauth/proxy/tokens/${session.sessionId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              codeVerifier: session.codeVerifier,
            }),
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            // Session not found or expired
            throw new Error('OAuth session expired or not found');
          }
          // Other errors - wait and retry
          await this.sleep(POLL_INTERVAL_MS);
          continue;
        }

        const data = (await response.json()) as ProxyTokensResponse;

        if (data.status === 'pending') {
          // Still waiting for user to complete consent
          await this.sleep(POLL_INTERVAL_MS);
          continue;
        }

        if (data.status === 'expired') {
          throw new Error('OAuth session expired');
        }

        if (data.success && data.tokens) {
          // Clear pending session
          this.pendingSession = null;
          op.success('Tokens received from proxy', { email: data.tokens.email });
          return data.tokens;
        }

        throw new Error(data.error || 'Failed to get tokens from proxy');
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('expired') || error.message.includes('not found'))
        ) {
          this.pendingSession = null;
          op.failure(error);
          throw error;
        }

        // Network error - wait and retry
        logger.debug('Poll attempt failed, retrying', {
          error: error instanceof Error ? error.message : String(error),
        });
        await this.sleep(POLL_INTERVAL_MS);
      }
    }

    this.pendingSession = null;
    op.failure('Polling timeout');
    throw new Error('OAuth polling timeout - user did not complete authorization');
  }

  /**
   * Refresh an access token through the proxy.
   * The proxy uses the client secret to refresh.
   */
  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
    const op = logger.startOperation('refreshTokens');

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_REFRESH_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.proxyBaseUrl}/api/oauth/proxy/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Proxy refresh failed: ${response.status} ${errorText}`);
        }

        const data = (await response.json()) as ProxyRefreshResponse;

        if (!data.success || !data.accessToken) {
          throw new Error(data.error || 'Failed to refresh token through proxy');
        }

        op.success('Token refreshed through proxy');

        return {
          accessToken: data.accessToken,
          expiresAt: data.expiresAt || Date.now() + 3600 * 1000,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('Token refresh attempt failed', {
          attempt,
          error: lastError.message,
        });

        if (attempt < MAX_REFRESH_RETRIES) {
          await this.sleep(1000 * attempt); // Exponential backoff
        }
      }
    }

    op.failure(lastError || 'Refresh failed after retries');
    throw lastError || new Error('Failed to refresh token after retries');
  }

  /**
   * Check if a session is still pending (user hasn't completed consent yet).
   */
  hasPendingSession(): boolean {
    return this.pendingSession !== null;
  }

  /**
   * Clear any pending session (e.g., if user cancelled).
   */
  clearPendingSession(): void {
    this.pendingSession = null;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let proxyClient: GoogleOAuthProxyClient | null = null;

/**
 * Get or create the GoogleOAuthProxyClient singleton.
 */
export function getGoogleOAuthProxyClient(): GoogleOAuthProxyClient {
  if (!proxyClient) {
    proxyClient = new GoogleOAuthProxyClient();
  }
  return proxyClient;
}

/**
 * Reset the proxy client singleton (for testing).
 */
export function resetGoogleOAuthProxyClient(): void {
  proxyClient = null;
}
