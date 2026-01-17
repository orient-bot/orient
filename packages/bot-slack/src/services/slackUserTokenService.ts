/**
 * Slack User Token Service
 *
 * Manages OAuth flow for obtaining user-level tokens that allow
 * posting messages as the user (instead of as the bot).
 *
 * Features:
 * - OAuth 2.0 flow for user authorization
 * - Secure token storage (encrypted)
 *
 * Exported via @orient/bot-slack package.
 * - Token refresh handling
 * - Multi-user support (optional)
 */

import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { createDedicatedServiceLogger } from '@orient/core';
import type { SlackUserModeConfig } from '@orient/core';

const logger = createDedicatedServiceLogger('slack-user-token', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

// =============================================================================
// Types
// =============================================================================

export interface UserTokenInfo {
  accessToken: string;
  userId: string;
  teamId: string;
  scope: string;
  tokenType: string;
  expiresAt?: Date;
  refreshToken?: string;
}

export interface OAuthStartResult {
  authUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  tokenInfo?: UserTokenInfo;
  error?: string;
}

export interface SlackUserTokenServiceConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey?: string; // 32-byte hex key for token encryption
  scopes?: string[];
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_USER_SCOPES = [
  'chat:write', // Post messages as user
  'users:read', // Read user info
  'channels:read', // List channels
  'groups:read', // List private channels
  'im:read', // List DMs
  'reactions:write', // Add reactions as user
];

const SLACK_OAUTH_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';

// =============================================================================
// Service Implementation
// =============================================================================

export class SlackUserTokenService {
  private config: SlackUserTokenServiceConfig;
  private pendingStates: Map<string, { createdAt: Date; redirectUri: string }> = new Map();
  private storedTokens: Map<string, UserTokenInfo> = new Map();
  private encryptionKey: Buffer | null = null;

  constructor(config: SlackUserTokenServiceConfig) {
    this.config = config;

    // Set up encryption if key provided
    if (config.encryptionKey) {
      this.encryptionKey = Buffer.from(config.encryptionKey, 'hex');
      if (this.encryptionKey.length !== 32) {
        throw new Error('Encryption key must be 32 bytes (64 hex characters)');
      }
    }

    // Clean up expired states periodically
    setInterval(() => this.cleanupExpiredStates(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Start the OAuth flow - returns URL to redirect user to
   */
  startOAuthFlow(customRedirectUri?: string): OAuthStartResult {
    const state = crypto.randomBytes(32).toString('hex');
    const redirectUri = customRedirectUri || this.config.redirectUri;

    // Store the state for verification
    this.pendingStates.set(state, {
      createdAt: new Date(),
      redirectUri,
    });

    // Build OAuth URL
    const scopes = this.config.scopes || DEFAULT_USER_SCOPES;
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: scopes.join(','),
      redirect_uri: redirectUri,
      state,
      user_scope: scopes.join(','), // Request user token, not bot token
    });

    const authUrl = `${SLACK_OAUTH_AUTHORIZE_URL}?${params.toString()}`;

    logger.info('OAuth flow started', { state: state.substring(0, 8) + '...' });

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback - exchange code for token
   */
  async handleOAuthCallback(code: string, state: string): Promise<OAuthCallbackResult> {
    // Verify state
    const pendingState = this.pendingStates.get(state);
    if (!pendingState) {
      logger.warn('Invalid OAuth state', { state: state.substring(0, 8) + '...' });
      return { success: false, error: 'Invalid or expired state' };
    }

    // Check if state is expired (15 minutes max)
    const stateAge = Date.now() - pendingState.createdAt.getTime();
    if (stateAge > 15 * 60 * 1000) {
      this.pendingStates.delete(state);
      return { success: false, error: 'OAuth state expired' };
    }

    // Clean up state
    this.pendingStates.delete(state);

    // Exchange code for token
    try {
      const response = await fetch(SLACK_OAUTH_ACCESS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: pendingState.redirectUri,
        }).toString(),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        authed_user?: {
          id: string;
          access_token: string;
          token_type: string;
          scope: string;
          refresh_token?: string;
          expires_in?: number;
        };
        team?: {
          id: string;
          name: string;
        };
      };

      if (!data.ok || !data.authed_user) {
        logger.error('OAuth token exchange failed', { error: data.error });
        return { success: false, error: data.error || 'Token exchange failed' };
      }

      const authedUser = data.authed_user;
      const tokenInfo: UserTokenInfo = {
        accessToken: authedUser.access_token,
        userId: authedUser.id,
        teamId: data.team?.id || '',
        scope: authedUser.scope,
        tokenType: authedUser.token_type || 'user',
        refreshToken: authedUser.refresh_token,
        expiresAt: authedUser.expires_in
          ? new Date(Date.now() + authedUser.expires_in * 1000)
          : undefined,
      };

      // Store the token
      this.storeToken(tokenInfo);

      logger.info('OAuth token obtained', {
        userId: tokenInfo.userId,
        teamId: tokenInfo.teamId,
        hasRefreshToken: !!tokenInfo.refreshToken,
        expiresAt: tokenInfo.expiresAt?.toISOString(),
      });

      return { success: true, tokenInfo };
    } catch (error) {
      logger.error('OAuth callback error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth callback failed',
      };
    }
  }

  /**
   * Store a token (optionally encrypted)
   */
  private storeToken(tokenInfo: UserTokenInfo): void {
    if (this.encryptionKey) {
      // Encrypt the access token
      const encryptedToken = this.encrypt(tokenInfo.accessToken);
      const encryptedRefreshToken = tokenInfo.refreshToken
        ? this.encrypt(tokenInfo.refreshToken)
        : undefined;

      this.storedTokens.set(tokenInfo.userId, {
        ...tokenInfo,
        accessToken: encryptedToken,
        refreshToken: encryptedRefreshToken,
      });
    } else {
      this.storedTokens.set(tokenInfo.userId, tokenInfo);
    }
  }

  /**
   * Get a stored token (decrypted)
   */
  getToken(userId?: string): UserTokenInfo | null {
    // If no userId specified, get the first (primary) token
    const key = userId || (this.storedTokens.keys().next().value as string | undefined);
    if (!key) return null;

    const storedToken = this.storedTokens.get(key);
    if (!storedToken) return null;

    if (this.encryptionKey) {
      // Decrypt the tokens
      return {
        ...storedToken,
        accessToken: this.decrypt(storedToken.accessToken),
        refreshToken: storedToken.refreshToken ? this.decrypt(storedToken.refreshToken) : undefined,
      };
    }

    return storedToken;
  }

  /**
   * Get a WebClient configured with the user token
   */
  getUserClient(userId?: string): WebClient | null {
    const token = this.getToken(userId);
    if (!token) return null;

    return new WebClient(token.accessToken);
  }

  /**
   * Check if a user token is available
   */
  hasUserToken(userId?: string): boolean {
    return this.getToken(userId) !== null;
  }

  /**
   * Check if token needs refresh
   */
  needsRefresh(userId?: string): boolean {
    const token = this.getToken(userId);
    if (!token || !token.expiresAt) return false;

    // Refresh if expires within 5 minutes
    return token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  }

  /**
   * Refresh an expired token
   */
  async refreshToken(userId?: string): Promise<boolean> {
    const token = this.getToken(userId);
    if (!token || !token.refreshToken) {
      logger.warn('Cannot refresh - no refresh token available');
      return false;
    }

    try {
      const response = await fetch(SLACK_OAUTH_ACCESS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
        }).toString(),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      if (!data.ok || !data.access_token) {
        logger.error('Token refresh failed', { error: data.error });
        return false;
      }

      // Update stored token
      const updatedToken: UserTokenInfo = {
        ...token,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || token.refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      };

      this.storeToken(updatedToken);

      logger.info('Token refreshed successfully', { userId: token.userId });
      return true;
    } catch (error) {
      logger.error('Token refresh error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Remove a stored token
   */
  removeToken(userId?: string): boolean {
    const key = userId || (this.storedTokens.keys().next().value as string | undefined);
    if (!key) return false;

    return this.storedTokens.delete(key);
  }

  /**
   * Encrypt a string using AES-256-GCM
   */
  private encrypt(text: string): string {
    if (!this.encryptionKey) return text;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a string using AES-256-GCM
   */
  private decrypt(encryptedText: string): string {
    if (!this.encryptionKey) return encryptedText;

    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Clean up expired OAuth states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [state, info] of this.pendingStates.entries()) {
      if (now - info.createdAt.getTime() > 15 * 60 * 1000) {
        this.pendingStates.delete(state);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired OAuth states', { count: cleaned });
    }
  }

  /**
   * Load token from config (for tokens stored in environment)
   */
  loadFromConfig(config: SlackUserModeConfig): void {
    if (config.enabled && config.token) {
      // Create a basic token info from config
      const tokenInfo: UserTokenInfo = {
        accessToken: config.token,
        userId: 'config_user',
        teamId: '',
        scope: DEFAULT_USER_SCOPES.join(','),
        tokenType: 'user',
      };

      this.storeToken(tokenInfo);
      logger.info('User token loaded from config');
    }
  }
}

/**
 * Create a Slack user token service
 */
export function createSlackUserTokenService(
  config: SlackUserTokenServiceConfig
): SlackUserTokenService {
  return new SlackUserTokenService(config);
}
