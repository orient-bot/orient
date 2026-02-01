/**
 * GitHub OAuth Configuration
 *
 * OAuth 2.0 configuration for GitHub API access.
 * Supports both OAuth Apps and GitHub Apps authentication.
 */

import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('github-oauth');

/**
 * GitHub OAuth scopes
 */
export const GITHUB_SCOPES = {
  // Repository
  REPO: 'repo',
  REPO_STATUS: 'repo:status',
  REPO_DEPLOYMENT: 'repo_deployment',
  PUBLIC_REPO: 'public_repo',

  // User
  READ_USER: 'read:user',
  USER_EMAIL: 'user:email',
  USER_FOLLOW: 'user:follow',

  // Organization
  READ_ORG: 'read:org',
  ADMIN_ORG: 'admin:org',

  // Actions
  WORKFLOW: 'workflow',

  // Packages
  READ_PACKAGES: 'read:packages',
  WRITE_PACKAGES: 'write:packages',

  // Discussions
  READ_DISCUSSION: 'read:discussion',
  WRITE_DISCUSSION: 'write:discussion',

  // Notifications
  NOTIFICATIONS: 'notifications',

  // Gists
  GIST: 'gist',

  // GPG Keys
  READ_GPG_KEY: 'read:gpg_key',
  WRITE_GPG_KEY: 'write:gpg_key',

  // SSH Keys
  READ_PUBLIC_KEY: 'read:public_key',
  WRITE_PUBLIC_KEY: 'write:public_key',
} as const;

/**
 * Default scopes for GitHub integration
 */
export const DEFAULT_GITHUB_SCOPES = [
  GITHUB_SCOPES.REPO,
  GITHUB_SCOPES.READ_USER,
  GITHUB_SCOPES.USER_EMAIL,
  GITHUB_SCOPES.READ_ORG,
  GITHUB_SCOPES.WORKFLOW,
];

/**
 * GitHub OAuth configuration
 */
export interface GitHubOAuthConfig {
  /** OAuth App Client ID */
  clientId: string;
  /** OAuth App Client Secret */
  clientSecret: string;
  /** Redirect URI for OAuth callback */
  redirectUri: string;
  /** Optional: Allow signup during OAuth */
  allowSignup?: boolean;
}

/**
 * GitHub OAuth tokens
 */
export interface GitHubTokens {
  /** Access token for API requests */
  accessToken: string;
  /** Token type (usually 'bearer') */
  tokenType: string;
  /** Scopes granted */
  scope: string[];
}

/**
 * GitHub user info from API
 */
export interface GitHubUserInfo {
  /** User ID */
  id: number;
  /** Username */
  login: string;
  /** Display name */
  name: string | null;
  /** Email address */
  email: string | null;
  /** Avatar URL */
  avatarUrl: string;
  /** Profile URL */
  htmlUrl: string;
  /** Bio */
  bio: string | null;
  /** Company */
  company: string | null;
  /** Location */
  location: string | null;
  /** Public repos count */
  publicRepos: number;
  /** Followers count */
  followers: number;
  /** Following count */
  following: number;
  /** Account creation date */
  createdAt: string;
}

/**
 * Generate the GitHub authorization URL
 */
export function getGitHubAuthUrl(
  config: GitHubOAuthConfig,
  scopes: string[] = DEFAULT_GITHUB_SCOPES,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(' '),
    state,
    allow_signup: String(config.allowSignup ?? true),
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGitHubCode(
  config: GitHubOAuthConfig,
  code: string
): Promise<GitHubTokens> {
  const op = logger.startOperation('exchangeCode');

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      scope: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    const tokens: GitHubTokens = {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope ? data.scope.split(',') : [],
    };

    op.success('Token exchange successful');
    return tokens;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * Get GitHub user info using the API
 */
export async function getGitHubUserInfo(accessToken: string): Promise<GitHubUserInfo> {
  const op = logger.startOperation('getUserInfo');

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      id: number;
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string;
      html_url: string;
      bio: string | null;
      company: string | null;
      location: string | null;
      public_repos: number;
      followers: number;
      following: number;
      created_at: string;
    };

    const userInfo: GitHubUserInfo = {
      id: data.id,
      login: data.login,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatar_url,
      htmlUrl: data.html_url,
      bio: data.bio,
      company: data.company,
      location: data.location,
      publicRepos: data.public_repos,
      followers: data.followers,
      following: data.following,
      createdAt: data.created_at,
    };

    op.success('User info retrieved', { userId: userInfo.id, login: userInfo.login });
    return userInfo;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * Get user emails (requires user:email scope)
 */
export async function getGitHubUserEmails(
  accessToken: string
): Promise<Array<{ email: string; primary: boolean; verified: boolean }>> {
  const op = logger.startOperation('getUserEmails');

  try {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user emails: ${response.statusText}`);
    }

    const data = (await response.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    op.success('User emails retrieved', { count: data.length });
    return data;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * Check token validity
 */
export async function checkGitHubToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Create GitHub OAuth configuration from environment variables
 */
export function getGitHubOAuthConfigFromEnv(redirectUri: string): GitHubOAuthConfig | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn('GitHub OAuth not configured', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    allowSignup: true,
  };
}
