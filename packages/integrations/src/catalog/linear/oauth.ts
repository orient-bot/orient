/**
 * Linear OAuth Service
 *
 * OAuth 2.0 implementation for Linear.
 * Based on the GitHub OAuth service pattern.
 */

import { createServiceLogger } from '@orient/core';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';

const logger = createServiceLogger('linear-oauth');

// OAuth configuration
const LINEAR_AUTH_URL = 'https://linear.app/oauth/authorize';
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';
const LINEAR_API_URL = 'https://api.linear.app/graphql';

// Default scopes for Linear
export const DEFAULT_LINEAR_SCOPES = ['read', 'write', 'issues:create', 'comments:create'];

// OAuth callback configuration
const OAUTH_CALLBACK_PORT = 8770;
const OAUTH_CALLBACK_PATH = '/oauth/linear/callback';

// Environment-based configuration
export const IS_LINEAR_OAUTH_PRODUCTION = !!process.env.LINEAR_OAUTH_CALLBACK_URL;

// Token storage
const DATA_DIR = path.join(process.cwd(), 'data', 'oauth-tokens');
const TOKEN_FILE = path.join(DATA_DIR, 'linear-oauth.json');

/**
 * Linear Account information
 */
export interface LinearAccount {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  organizationName?: string;
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
  account: LinearAccount;
}

/**
 * OAuth state for CSRF protection
 */
interface OAuthState {
  state: string;
  scopes: string[];
  createdAt: number;
}

/**
 * Linear OAuth Service
 */
export class LinearOAuthService {
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
    if (IS_LINEAR_OAUTH_PRODUCTION) {
      return process.env.LINEAR_OAUTH_CALLBACK_URL!;
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
        logger.debug('Loaded Linear OAuth tokens from disk');
      }
    } catch (error) {
      logger.warn('Failed to load Linear OAuth tokens', {
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
      logger.debug('Saved Linear OAuth tokens to disk');
    } catch (error) {
      logger.error('Failed to save Linear OAuth tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the client credentials from environment
   */
  private getClientCredentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.LINEAR_CLIENT_ID;
    const clientSecret = process.env.LINEAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Linear OAuth credentials not configured. Set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET.'
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
    scopes: string[] = DEFAULT_LINEAR_SCOPES
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
      client_id: clientId,
      scope: scopes.join(','),
      redirect_uri: callbackUrl,
      state,
      response_type: 'code',
      prompt: 'consent',
    });

    const authUrl = `${LINEAR_AUTH_URL}?${params.toString()}`;

    logger.info('Linear OAuth flow started', { state: state.substring(0, 8) + '...' });

    return { authUrl, state };
  }

  /**
   * Handle the OAuth callback
   */
  async handleCallback(code: string, state: string): Promise<LinearAccount> {
    const op = logger.startOperation('handleLinearOAuthCallback');

    // Validate state
    const pendingState = this.pendingStates.get(state);
    if (!pendingState) {
      throw new Error('Invalid or expired state parameter');
    }

    this.pendingStates.delete(state);

    const { clientId, clientSecret } = this.getClientCredentials();
    const callbackUrl = this.getCallbackUrl();

    // Exchange code for tokens
    const tokenResponse = await fetch(LINEAR_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
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
      token_type: string;
      expires_in?: number;
      scope?: string;
    };

    // Get user info from Linear GraphQL API
    const userResponse = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        query: `
          query Me {
            viewer {
              id
              email
              name
              displayName
              avatarUrl
              organization {
                id
                name
              }
            }
          }
        `,
      }),
    });

    if (!userResponse.ok) {
      op.failure(new Error('Failed to get user info'));
      throw new Error('Failed to get user info');
    }

    const userData = (await userResponse.json()) as {
      data?: {
        viewer?: {
          id: string;
          email: string;
          name?: string;
          displayName?: string;
          avatarUrl?: string;
          organization?: {
            id: string;
            name: string;
          };
        };
      };
    };

    const viewer = userData.data?.viewer;
    if (!viewer) {
      op.failure(new Error('Failed to get viewer data'));
      throw new Error('Failed to get viewer data');
    }

    const account: LinearAccount = {
      id: viewer.id,
      email: viewer.email,
      displayName: viewer.displayName || viewer.name || viewer.email,
      avatarUrl: viewer.avatarUrl,
      organizationName: viewer.organization?.name,
      scopes: pendingState.scopes,
      connectedAt: new Date().toISOString(),
    };

    // Store tokens
    this.tokens = {
      accessToken: tokenData.access_token,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      account,
    };

    this.saveTokens();

    op.success('Linear OAuth completed', {
      accountId: account.id,
      email: account.email,
    });

    return account;
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    if (!this.tokens) {
      return null;
    }

    // Check if token is expired
    if (this.tokens.expiresAt && Date.now() > this.tokens.expiresAt) {
      logger.warn('Linear access token expired');
      return null;
    }

    return this.tokens.accessToken;
  }

  /**
   * Get connected accounts
   */
  getConnectedAccounts(): LinearAccount[] {
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
    logger.info('Linear account disconnected');
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
                  <h1>Linear Connected!</h1>
                  <p>Successfully connected as ${account.displayName}${account.organizationName ? ` (${account.organizationName})` : ''}.</p>
                  <p>You can close this window.</p>
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ type: 'oauth-complete', provider: 'linear', success: true }, '*');
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
                      window.opener.postMessage({ type: 'oauth-complete', provider: 'linear', success: false }, '*');
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
          logger.debug('Linear OAuth callback port already in use, assuming server is running');
          resolve();
        } else {
          reject(err);
        }
      });

      this.callbackServer.listen(this.callbackPort, '127.0.0.1', () => {
        logger.info('Linear OAuth callback server started', { port: this.callbackPort });
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
      logger.debug('Linear OAuth callback server stopped');
    }
  }
}

// Singleton instance
let linearOAuthService: LinearOAuthService | null = null;

/**
 * Get the singleton Linear OAuth service instance
 */
export function getLinearOAuthService(): LinearOAuthService {
  if (!linearOAuthService) {
    linearOAuthService = new LinearOAuthService();
  }
  return linearOAuthService;
}

/**
 * Reset the OAuth service (for testing)
 */
export function resetLinearOAuthService(): void {
  if (linearOAuthService) {
    linearOAuthService.stopCallbackServer();
    linearOAuthService = null;
  }
}
