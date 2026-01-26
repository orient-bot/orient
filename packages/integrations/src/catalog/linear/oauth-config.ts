/**
 * Linear OAuth Configuration
 *
 * OAuth 2.0 configuration for Linear API access.
 * Linear uses standard OAuth 2.0 flow with refresh tokens.
 */

import { createServiceLogger } from '@orientbot/core';

const logger = createServiceLogger('linear-oauth');

/**
 * Linear OAuth scopes
 */
export const LINEAR_SCOPES = {
  READ: 'read',
  WRITE: 'write',
  ISSUES_CREATE: 'issues:create',
  COMMENTS_CREATE: 'comments:create',
} as const;

/**
 * Default scopes for Linear integration
 */
export const DEFAULT_LINEAR_SCOPES = [
  LINEAR_SCOPES.READ,
  LINEAR_SCOPES.WRITE,
  LINEAR_SCOPES.ISSUES_CREATE,
  LINEAR_SCOPES.COMMENTS_CREATE,
];

/**
 * Linear OAuth configuration
 */
export interface LinearOAuthConfig {
  /** OAuth Client ID */
  clientId: string;
  /** OAuth Client Secret */
  clientSecret: string;
  /** Redirect URI for OAuth callback */
  redirectUri: string;
  /** Optional: Actor (user or application) */
  actor?: string;
}

/**
 * Linear OAuth tokens
 */
export interface LinearTokens {
  /** Access token for API requests */
  accessToken: string;
  /** Token type (usually 'Bearer') */
  tokenType: string;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Scopes granted */
  scope: string[];
}

/**
 * Linear user info from API
 */
export interface LinearUserInfo {
  /** User ID */
  id: string;
  /** User name */
  name: string;
  /** User email */
  email: string;
  /** Display name */
  displayName?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Active status */
  active: boolean;
}

/**
 * Generate the Linear authorization URL
 */
export function getLinearAuthUrl(
  config: LinearOAuthConfig,
  scopes: string[] = DEFAULT_LINEAR_SCOPES,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes.join(','),
    state,
    prompt: 'consent',
  });

  if (config.actor) {
    params.set('actor', config.actor);
  }

  return `https://linear.app/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeLinearCode(
  config: LinearOAuthConfig,
  code: string
): Promise<LinearTokens> {
  const op = logger.startOperation('exchangeCode');

  try {
    const response = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
    };

    const tokens: LinearTokens = {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope.split(','),
    };

    op.success('Token exchange successful');
    return tokens;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * Revoke Linear tokens
 */
export async function revokeLinearToken(accessToken: string): Promise<void> {
  const op = logger.startOperation('revokeToken');

  try {
    const response = await fetch('https://api.linear.app/oauth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token: accessToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token revocation failed: ${error}`);
    }

    op.success('Token revoked successfully');
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * Get Linear user info using the API
 */
export async function getLinearUserInfo(accessToken: string): Promise<LinearUserInfo> {
  const op = logger.startOperation('getUserInfo');

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: `
          query Me {
            viewer {
              id
              name
              email
              displayName
              avatarUrl
              active
            }
          }
        `,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: { viewer: LinearUserInfo };
    };

    op.success('User info retrieved', { userId: data.data.viewer.id });
    return data.data.viewer;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * Create Linear OAuth configuration from environment variables
 */
export function getLinearOAuthConfigFromEnv(redirectUri: string): LinearOAuthConfig | null {
  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn('Linear OAuth not configured', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}
