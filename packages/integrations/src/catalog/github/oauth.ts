/**
 * GitHub OAuth Service
 *
 * Provides OAuth 2.0 authentication for GitHub.
 * Supports repository access, issues, pull requests, actions, and more.
 *
 * Features:
 * - Browser-based OAuth flow
 * - Persistent token storage
 * - Automatic token validation
 * - User info retrieval
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createServiceLogger } from '@orient/core';
import {
  getGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUserInfo,
  checkGitHubToken,
  DEFAULT_GITHUB_SCOPES,
  type GitHubOAuthConfig,
  type GitHubTokens,
  type GitHubUserInfo,
} from './oauth-config.js';

const logger = createServiceLogger('github-oauth');

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface GitHubAccount {
  /** GitHub username (unique identifier) */
  login: string;
  /** User ID */
  id: number;
  /** Display name */
  name: string | null;
  /** Primary email address */
  email: string | null;
  /** Avatar URL */
  avatarUrl: string;
  /** OAuth access token */
  accessToken: string;
  /** Scopes granted by user */
  scopes: string[];
  /** When the account was connected */
  connectedAt: number;
  /** Last token validation timestamp */
  lastValidatedAt?: number;
}

export interface GitHubOAuthServiceConfig {
  /** OAuth App Client ID */
  clientId: string;
  /** OAuth App Client Secret */
  clientSecret: string;
  /** Port for local callback server (default: 8767) */
  callbackPort?: number;
  /** Production callback URL (overrides local callback) */
  callbackUrl?: string;
}

interface GitHubOAuthData {
  /** Connected GitHub accounts by username */
  accounts: Record<string, GitHubAccount>;
  /** Pending authorization states for CSRF protection */
  pendingStates: Record<
    string,
    {
      createdAt: number;
      scopes: string[];
    }
  >;
}

interface PendingAuth {
  resolve: (code: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// =============================================================================
// Constants
// =============================================================================

const DATA_DIR = path.resolve(process.cwd(), 'data', 'oauth-tokens');
const TOKEN_FILE = path.join(DATA_DIR, 'github-oauth.json');
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CALLBACK_PORT = 8767;
const CALLBACK_PATH = '/oauth/github/callback';

// =============================================================================
// HTML Templates
// =============================================================================

const HTML_SUCCESS = (login: string) => `<!DOCTYPE html>
<html>
<head>
  <title>GitHub Account Connected</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #24292e 0%, #0d1117 100%); color: #fff; }
    .container { text-align: center; padding: 2rem; background: rgba(255,255,255,0.1); border-radius: 1rem; backdrop-filter: blur(10px); }
    h1 { color: #3fb950; margin-bottom: 1rem; }
    p { color: rgba(255,255,255,0.9); }
    .login { font-weight: bold; color: #58a6ff; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ GitHub Account Connected</h1>
    <p>Successfully connected as <span class="login">@${login}</span></p>
    <p>You can close this window and return to the application.</p>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>`;

const HTML_ERROR = (error: string) => `<!DOCTYPE html>
<html>
<head>
  <title>GitHub OAuth Failed</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #f87171 0%, #dc2626 100%); color: #fff; }
    .container { text-align: center; padding: 2rem; background: rgba(255,255,255,0.1); border-radius: 1rem; backdrop-filter: blur(10px); }
    h1 { color: #fef2f2; margin-bottom: 1rem; }
    p { color: rgba(255,255,255,0.9); }
    .error { font-family: monospace; margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Authorization Failed</h1>
    <p>An error occurred during GitHub authorization.</p>
    <div class="error">${error}</div>
  </div>
</body>
</html>`;

// =============================================================================
// GitHubOAuthService Class
// =============================================================================

export class GitHubOAuthService {
  private config: GitHubOAuthServiceConfig;
  private callbackServer: Server | null = null;
  private pendingAuths = new Map<string, PendingAuth>();
  private data: GitHubOAuthData;

  constructor(config: GitHubOAuthServiceConfig) {
    this.config = config;
    this.ensureDataDir();
    this.data = this.loadData();

    logger.info('GitHubOAuthService initialized', {
      callbackUrl: this.getCallbackUrl(),
      accountCount: Object.keys(this.data.accounts).length,
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Start the OAuth flow to connect a GitHub account.
   * Returns the authorization URL that should be opened in a browser.
   */
  async startOAuthFlow(scopes: string[] = DEFAULT_GITHUB_SCOPES): Promise<{
    authUrl: string;
    state: string;
  }> {
    const op = logger.startOperation('startOAuthFlow');

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store pending auth state
    this.data.pendingStates[state] = {
      createdAt: Date.now(),
      scopes,
    };
    this.saveData();

    // Generate authorization URL
    const oauthConfig: GitHubOAuthConfig = {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.getCallbackUrl(),
    };

    const authUrl = getGitHubAuthUrl(oauthConfig, scopes, state);

    op.success('OAuth flow started', {
      state: state.substring(0, 8) + '...',
      scopeCount: scopes.length,
    });

    return { authUrl, state };
  }

  /**
   * Handle the OAuth callback.
   * Exchanges the authorization code for tokens and retrieves user info.
   */
  async handleCallback(
    code: string,
    state: string
  ): Promise<{ success: boolean; account?: GitHubAccount; error?: string }> {
    const op = logger.startOperation('handleCallback');

    // Validate state
    const pendingState = this.data.pendingStates[state];
    if (!pendingState) {
      op.failure('Invalid or expired state');
      return { success: false, error: 'Invalid or expired authorization state' };
    }

    // Check if state is expired (older than 10 minutes)
    if (Date.now() - pendingState.createdAt > 10 * 60 * 1000) {
      delete this.data.pendingStates[state];
      this.saveData();
      op.failure('State expired');
      return { success: false, error: 'Authorization state expired. Please try again.' };
    }

    try {
      // Exchange code for tokens
      const oauthConfig: GitHubOAuthConfig = {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        redirectUri: this.getCallbackUrl(),
      };

      const tokens = await exchangeGitHubCode(oauthConfig, code);

      // Get user info
      const userInfo = await getGitHubUserInfo(tokens.accessToken);

      // Create account entry
      const account: GitHubAccount = {
        login: userInfo.login,
        id: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        avatarUrl: userInfo.avatarUrl,
        accessToken: tokens.accessToken,
        scopes: tokens.scope,
        connectedAt: Date.now(),
        lastValidatedAt: Date.now(),
      };

      // Save account
      this.data.accounts[userInfo.login] = account;
      delete this.data.pendingStates[state];
      this.saveData();

      // Resolve any pending auth waiters
      const pendingAuth = this.pendingAuths.get(state);
      if (pendingAuth) {
        clearTimeout(pendingAuth.timeout);
        pendingAuth.resolve(code);
        this.pendingAuths.delete(state);
      }

      op.success('Account connected', { login: userInfo.login });
      return { success: true, account };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      delete this.data.pendingStates[state];
      this.saveData();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete authorization',
      };
    }
  }

  /**
   * Get all connected GitHub accounts.
   */
  getConnectedAccounts(): GitHubAccount[] {
    return Object.values(this.data.accounts);
  }

  /**
   * Get a specific connected account by username.
   */
  getAccount(login: string): GitHubAccount | undefined {
    return this.data.accounts[login];
  }

  /**
   * Get the first (or only) connected account.
   */
  getPrimaryAccount(): GitHubAccount | undefined {
    const accounts = this.getConnectedAccounts();
    return accounts[0];
  }

  /**
   * Validate a token and update the last validated timestamp.
   */
  async validateToken(login: string): Promise<boolean> {
    const account = this.data.accounts[login];
    if (!account) {
      return false;
    }

    const isValid = await checkGitHubToken(account.accessToken);
    if (isValid) {
      account.lastValidatedAt = Date.now();
      this.saveData();
    }

    return isValid;
  }

  /**
   * Disconnect a GitHub account.
   */
  disconnectAccount(login: string): boolean {
    if (this.data.accounts[login]) {
      delete this.data.accounts[login];
      this.saveData();
      logger.info('Account disconnected', { login });
      return true;
    }
    return false;
  }

  /**
   * Disconnect all accounts.
   */
  disconnectAll(): void {
    this.data.accounts = {};
    this.saveData();
    logger.info('All accounts disconnected');
  }

  /**
   * Check if any account is connected.
   */
  isConnected(): boolean {
    return Object.keys(this.data.accounts).length > 0;
  }

  /**
   * Get the callback URL for OAuth.
   */
  getCallbackUrl(): string {
    if (this.config.callbackUrl) {
      return this.config.callbackUrl;
    }
    const port = this.config.callbackPort || DEFAULT_CALLBACK_PORT;
    return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  }

  /**
   * Ensure the callback server is running (for local development).
   */
  async ensureCallbackServerRunning(): Promise<void> {
    if (this.callbackServer) {
      return;
    }

    const port = this.config.callbackPort || DEFAULT_CALLBACK_PORT;

    return new Promise((resolve, reject) => {
      this.callbackServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '', `http://127.0.0.1:${port}`);

        if (url.pathname === CALLBACK_PATH) {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(HTML_ERROR(errorDescription || error));
            return;
          }

          if (!code || !state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(HTML_ERROR('Missing code or state parameter'));
            return;
          }

          const result = await this.handleCallback(code, state);

          if (result.success && result.account) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(HTML_SUCCESS(result.account.login));
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(HTML_ERROR(result.error || 'Unknown error'));
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      this.callbackServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn(`Port ${port} already in use, assuming callback server is running`);
          this.callbackServer = null;
          resolve();
        } else {
          reject(err);
        }
      });

      this.callbackServer.listen(port, '127.0.0.1', () => {
        logger.info('GitHub OAuth callback server started', { port });
        resolve();
      });
    });
  }

  /**
   * Stop the callback server.
   */
  stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
      logger.info('GitHub OAuth callback server stopped');
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadData(): GitHubOAuthData {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
        const data = JSON.parse(raw);
        return {
          accounts: data.accounts || {},
          pendingStates: data.pendingStates || {},
        };
      }
    } catch (error) {
      logger.warn('Failed to load GitHub OAuth data, starting fresh', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { accounts: {}, pendingStates: {} };
  }

  private saveData(): void {
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger.error('Failed to save GitHub OAuth data', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// =============================================================================
// Production OAuth callback handler
// =============================================================================

/**
 * Check if we're in production mode (callback URL is HTTPS).
 */
export const IS_GITHUB_OAUTH_PRODUCTION = (() => {
  const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL;
  return callbackUrl ? callbackUrl.startsWith('https://') : false;
})();

// =============================================================================
// Factory Function
// =============================================================================

let gitHubOAuthService: GitHubOAuthService | null = null;
let cachedCredentials: { clientId: string; clientSecret: string } | null = null;

/**
 * Reset the GitHubOAuthService singleton.
 * Call this when credentials are updated to force reinitialization.
 */
export function resetGitHubOAuthService(): void {
  if (gitHubOAuthService) {
    gitHubOAuthService.stopCallbackServer();
  }
  gitHubOAuthService = null;
  cachedCredentials = null;
  logger.info('GitHub OAuth service reset - will reinitialize on next use');
}

/**
 * Get or create the GitHubOAuthService singleton.
 */
export function getGitHubOAuthService(config?: GitHubOAuthServiceConfig): GitHubOAuthService {
  // Check if environment credentials have changed since we last cached
  const currentClientId = process.env.GITHUB_CLIENT_ID;
  const currentClientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (gitHubOAuthService && cachedCredentials) {
    // If credentials changed, reset the service
    if (
      currentClientId &&
      currentClientSecret &&
      (currentClientId !== cachedCredentials.clientId ||
        currentClientSecret !== cachedCredentials.clientSecret)
    ) {
      logger.info('GitHub OAuth credentials changed, reinitializing service');
      resetGitHubOAuthService();
    }
  }

  if (gitHubOAuthService) {
    return gitHubOAuthService;
  }

  if (!config) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
      );
    }

    config = {
      clientId,
      clientSecret,
      callbackPort: parseInt(
        process.env.GITHUB_OAUTH_CALLBACK_PORT || String(DEFAULT_CALLBACK_PORT),
        10
      ),
      callbackUrl: process.env.GITHUB_OAUTH_CALLBACK_URL,
    };
  }

  // Cache the credentials so we can detect changes
  cachedCredentials = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };

  gitHubOAuthService = new GitHubOAuthService(config);
  return gitHubOAuthService;
}

/**
 * Handle OAuth callback from Express (for production mode).
 */
export async function handleGitHubOAuthCallback(
  code: string | null,
  state: string | null,
  error: string | null,
  errorDescription: string | null
): Promise<{ success: boolean; html: string; error?: string; login?: string }> {
  if (error) {
    const errorMsg = errorDescription || error;
    return {
      success: false,
      html: HTML_ERROR(errorMsg),
      error: errorMsg,
    };
  }

  if (!code || !state) {
    const errorMsg = 'Missing code or state parameter';
    return {
      success: false,
      html: HTML_ERROR(errorMsg),
      error: errorMsg,
    };
  }

  try {
    const service = getGitHubOAuthService();
    const result = await service.handleCallback(code, state);

    if (result.success && result.account) {
      return {
        success: true,
        html: HTML_SUCCESS(result.account.login),
        login: result.account.login,
      };
    }

    return {
      success: false,
      html: HTML_ERROR(result.error || 'Unknown error'),
      error: result.error,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to complete authorization';
    return {
      success: false,
      html: HTML_ERROR(errorMsg),
      error: errorMsg,
    };
  }
}

// Re-export types and constants
export { DEFAULT_GITHUB_SCOPES } from './oauth-config.js';
