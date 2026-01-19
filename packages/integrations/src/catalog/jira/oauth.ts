/**
 * JIRA OAuth Service
 *
 * OAuth 2.0 implementation for Atlassian JIRA Cloud.
 * Based on the GitHub OAuth service pattern.
 */

import { createServiceLogger } from '@orient/core';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';

const logger = createServiceLogger('jira-oauth');

// OAuth configuration
const JIRA_AUTH_URL = 'https://auth.atlassian.com/authorize';
const JIRA_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const JIRA_API_URL = 'https://api.atlassian.com';
const JIRA_ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

// Default scopes for JIRA
export const DEFAULT_JIRA_SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'manage:jira-project',
  'offline_access', // For refresh tokens
];

// OAuth callback configuration
const OAUTH_CALLBACK_PORT = 8769;
const OAUTH_CALLBACK_PATH = '/oauth/jira/callback';

// Environment-based configuration
export const IS_JIRA_OAUTH_PRODUCTION = !!process.env.JIRA_OAUTH_CALLBACK_URL;

// Token storage
const DATA_DIR = path.join(process.cwd(), 'data', 'oauth-tokens');
const TOKEN_FILE = path.join(DATA_DIR, 'jira-oauth.json');

/**
 * JIRA Account information
 */
export interface JiraAccount {
  id: string;
  cloudId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  siteName: string;
  siteUrl: string;
  scopes: string[];
  connectedAt: string;
}

/**
 * Stored tokens structure
 */
interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  cloudId: string;
  account: JiraAccount;
}

/**
 * OAuth state for CSRF protection
 */
interface OAuthState {
  state: string;
  codeVerifier?: string;
  scopes: string[];
  createdAt: number;
}

/**
 * JIRA OAuth Service
 */
export class JiraOAuthService {
  private pendingStates: Map<string, OAuthState> = new Map();
  private tokens: StoredTokens | null = null;
  private callbackServer: http.Server | null = null;
  private callbackPort: number;

  constructor() {
    this.callbackPort = OAUTH_CALLBACK_PORT;
    this.loadTokens();
  }

  /**
   * Get the callback URL
   */
  getCallbackUrl(): string {
    if (IS_JIRA_OAUTH_PRODUCTION) {
      return process.env.JIRA_OAUTH_CALLBACK_URL!;
    }
    return `http://127.0.0.1:${this.callbackPort}${OAUTH_CALLBACK_PATH}`;
  }

  /**
   * Load tokens from disk
   */
  private loadTokens(): void {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const data = fs.readFileSync(TOKEN_FILE, 'utf-8');
        this.tokens = JSON.parse(data);
        logger.debug('Loaded JIRA OAuth tokens from disk');
      }
    } catch (error) {
      logger.warn('Failed to load JIRA OAuth tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Save tokens to disk
   */
  private saveTokens(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.tokens, null, 2));
      logger.debug('Saved JIRA OAuth tokens to disk');
    } catch (error) {
      logger.error('Failed to save JIRA OAuth tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the client credentials from environment
   */
  private getClientCredentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
    const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'JIRA OAuth credentials not configured. Set JIRA_OAUTH_CLIENT_ID and JIRA_OAUTH_CLIENT_SECRET.'
      );
    }

    return { clientId, clientSecret };
  }

  /**
   * Generate a random state for CSRF protection
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Start the OAuth flow
   */
  async startOAuthFlow(
    scopes: string[] = DEFAULT_JIRA_SCOPES
  ): Promise<{ authUrl: string; state: string }> {
    const { clientId } = this.getClientCredentials();
    const state = this.generateState();

    // Store the state for validation
    this.pendingStates.set(state, {
      state,
      scopes,
      createdAt: Date.now(),
    });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of this.pendingStates) {
      if (value.createdAt < tenMinutesAgo) {
        this.pendingStates.delete(key);
      }
    }

    const callbackUrl = this.getCallbackUrl();

    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: scopes.join(' '),
      redirect_uri: callbackUrl,
      state,
      response_type: 'code',
      prompt: 'consent',
    });

    const authUrl = `${JIRA_AUTH_URL}?${params.toString()}`;

    logger.info('JIRA OAuth flow started', { state: state.substring(0, 8) + '...' });

    return { authUrl, state };
  }

  /**
   * Handle the OAuth callback
   */
  async handleCallback(code: string, state: string): Promise<JiraAccount> {
    const op = logger.startOperation('handleJiraOAuthCallback');

    // Validate state
    const pendingState = this.pendingStates.get(state);
    if (!pendingState) {
      throw new Error('Invalid or expired state parameter');
    }

    this.pendingStates.delete(state);

    const { clientId, clientSecret } = this.getClientCredentials();
    const callbackUrl = this.getCallbackUrl();

    // Exchange code for tokens
    const tokenResponse = await fetch(JIRA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      op.failure(new Error(`Token exchange failed: ${error}`));
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    // Get accessible resources (JIRA cloud sites)
    const resourcesResponse = await fetch(JIRA_ACCESSIBLE_RESOURCES_URL, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      },
    });

    if (!resourcesResponse.ok) {
      op.failure(new Error('Failed to get accessible resources'));
      throw new Error('Failed to get accessible resources');
    }

    const resources = (await resourcesResponse.json()) as Array<{
      id: string;
      name: string;
      url: string;
      scopes: string[];
      avatarUrl?: string;
    }>;

    if (resources.length === 0) {
      op.failure(new Error('No accessible JIRA sites found'));
      throw new Error('No accessible JIRA sites found');
    }

    // Use the first available site
    const site = resources[0];

    // Get user info
    const userResponse = await fetch(`${JIRA_API_URL}/ex/jira/${site.id}/rest/api/3/myself`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      },
    });

    let userInfo = {
      accountId: '',
      emailAddress: '',
      displayName: site.name,
      avatarUrls: {} as Record<string, string>,
    };

    if (userResponse.ok) {
      userInfo = (await userResponse.json()) as typeof userInfo;
    }

    const account: JiraAccount = {
      id: userInfo.accountId || site.id,
      cloudId: site.id,
      email: userInfo.emailAddress || '',
      displayName: userInfo.displayName || site.name,
      avatarUrl: userInfo.avatarUrls?.['48x48'] || site.avatarUrl,
      siteName: site.name,
      siteUrl: site.url,
      scopes: site.scopes || pendingState.scopes,
      connectedAt: new Date().toISOString(),
    };

    // Store tokens
    this.tokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      cloudId: site.id,
      account,
    };

    this.saveTokens();

    op.success('JIRA OAuth completed', {
      accountId: account.id,
      siteName: account.siteName,
    });

    return account;
  }

  /**
   * Refresh the access token
   */
  async refreshAccessToken(): Promise<string | null> {
    if (!this.tokens?.refreshToken) {
      return null;
    }

    const { clientId, clientSecret } = this.getClientCredentials();

    try {
      const response = await fetch(JIRA_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: this.tokens.refreshToken,
        }),
      });

      if (!response.ok) {
        logger.warn('Failed to refresh JIRA access token');
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      this.tokens.accessToken = data.access_token;
      if (data.refresh_token) {
        this.tokens.refreshToken = data.refresh_token;
      }
      if (data.expires_in) {
        this.tokens.expiresAt = Date.now() + data.expires_in * 1000;
      }

      this.saveTokens();
      logger.debug('JIRA access token refreshed');

      return data.access_token;
    } catch (error) {
      logger.error('Error refreshing JIRA access token', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get access token, refreshing if needed
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.tokens) {
      return null;
    }

    // Check if token is expired or about to expire (within 5 minutes)
    if (this.tokens.expiresAt && this.tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
      const newToken = await this.refreshAccessToken();
      if (newToken) {
        return newToken;
      }
    }

    return this.tokens.accessToken;
  }

  /**
   * Get the cloud ID for API calls
   */
  getCloudId(): string | null {
    return this.tokens?.cloudId || null;
  }

  /**
   * Get connected accounts
   */
  getConnectedAccounts(): JiraAccount[] {
    if (this.tokens?.account) {
      return [this.tokens.account];
    }
    return [];
  }

  /**
   * Disconnect the account
   */
  disconnect(): void {
    this.tokens = null;
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        fs.unlinkSync(TOKEN_FILE);
      }
    } catch {
      // Ignore errors
    }
    logger.info('JIRA account disconnected');
  }

  /**
   * Ensure the callback server is running (for local development)
   */
  async ensureCallbackServerRunning(): Promise<void> {
    if (this.callbackServer) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.callbackServer = http.createServer(async (req, res) => {
        const url = new URL(req.url || '', `http://127.0.0.1:${this.callbackPort}`);

        if (url.pathname === OAUTH_CALLBACK_PATH) {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                  <script>setTimeout(() => window.close(), 3000);</script>
                </body>
              </html>
            `);
            return;
          }

          if (!code || !state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Invalid Request</h1>
                  <p>Missing code or state parameter.</p>
                </body>
              </html>
            `);
            return;
          }

          try {
            const account = await this.handleCallback(code, state);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>JIRA Connected!</h1>
                  <p>Successfully connected to ${account.siteName} as ${account.displayName}.</p>
                  <p>You can close this window.</p>
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ type: 'oauth-complete', provider: 'jira', success: true }, '*');
                    }
                    setTimeout(() => window.close(), 2000);
                  </script>
                </body>
              </html>
            `);
          } catch (err) {
            logger.error('OAuth callback error', {
              error: err instanceof Error ? err.message : String(err),
            });
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Connection Failed</h1>
                  <p>Error: ${err instanceof Error ? err.message : String(err)}</p>
                  <p>You can close this window and try again.</p>
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ type: 'oauth-complete', provider: 'jira', success: false }, '*');
                    }
                  </script>
                </body>
              </html>
            `);
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.callbackServer.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          logger.debug('JIRA OAuth callback port already in use, assuming server is running');
          resolve();
        } else {
          reject(err);
        }
      });

      this.callbackServer.listen(this.callbackPort, '127.0.0.1', () => {
        logger.info('JIRA OAuth callback server started', { port: this.callbackPort });
        resolve();
      });
    });
  }

  /**
   * Stop the callback server
   */
  stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
      logger.debug('JIRA OAuth callback server stopped');
    }
  }
}

// Singleton instance
let jiraOAuthService: JiraOAuthService | null = null;

/**
 * Get the singleton JIRA OAuth service instance
 */
export function getJiraOAuthService(): JiraOAuthService {
  if (!jiraOAuthService) {
    jiraOAuthService = new JiraOAuthService();
  }
  return jiraOAuthService;
}

/**
 * Reset the OAuth service (for testing)
 */
export function resetJiraOAuthService(): void {
  if (jiraOAuthService) {
    jiraOAuthService.stopCallbackServer();
    jiraOAuthService = null;
  }
}
