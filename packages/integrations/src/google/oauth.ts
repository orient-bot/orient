/**
 * Google OAuth Service
 *
 * Provides OAuth 2.0 authentication for personal Google accounts.
 * Supports Gmail, Calendar, Tasks, Sheets, and Slides APIs.
 *
 * Features:
 * - Browser-based OAuth flow with PKCE
 * - Multi-account support
 * - Automatic token refresh
 * - Secure token storage
 */

import { google, Auth } from 'googleapis';
import { CodeChallengeMethod } from 'google-auth-library';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('google-oauth');

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface GoogleAccount {
  /** Google account email (unique identifier) */
  email: string;
  /** Display name from Google profile */
  displayName?: string;
  /** OAuth access token */
  accessToken: string;
  /** OAuth refresh token (for getting new access tokens) */
  refreshToken: string;
  /** Token expiration timestamp (ms since epoch) */
  expiresAt: number;
  /** Scopes granted by user */
  scopes: string[];
  /** When the account was connected */
  connectedAt: number;
  /** Last token refresh timestamp */
  lastRefreshAt?: number;
}

export interface GoogleOAuthConfig {
  /** OAuth 2.0 Client ID */
  clientId: string;
  /** OAuth 2.0 Client Secret */
  clientSecret: string;
  /** Port for local callback server (default: 8766) */
  callbackPort?: number;
  /** Production callback URL (overrides local callback) */
  callbackUrl?: string;
}

interface GoogleOAuthData {
  /** Connected Google accounts by email */
  accounts: Record<string, GoogleAccount>;
  /** Pending authorization states for CSRF protection */
  pendingStates: Record<
    string,
    {
      codeVerifier: string;
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

/** Default scopes for Google OAuth */
export const GOOGLE_OAUTH_SCOPES = {
  // Gmail
  GMAIL_READONLY: 'https://www.googleapis.com/auth/gmail.readonly',
  GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_COMPOSE: 'https://www.googleapis.com/auth/gmail.compose',
  GMAIL_MODIFY: 'https://www.googleapis.com/auth/gmail.modify',

  // Calendar
  CALENDAR_READONLY: 'https://www.googleapis.com/auth/calendar.readonly',
  CALENDAR_EVENTS: 'https://www.googleapis.com/auth/calendar.events',
  CALENDAR_FULL: 'https://www.googleapis.com/auth/calendar',

  // Tasks
  TASKS_READONLY: 'https://www.googleapis.com/auth/tasks.readonly',
  TASKS_FULL: 'https://www.googleapis.com/auth/tasks',

  // Sheets
  SHEETS_READONLY: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  SHEETS_FULL: 'https://www.googleapis.com/auth/spreadsheets',

  // Slides
  SLIDES_READONLY: 'https://www.googleapis.com/auth/presentations.readonly',
  SLIDES_FULL: 'https://www.googleapis.com/auth/presentations',

  // Drive (needed for file access)
  DRIVE_READONLY: 'https://www.googleapis.com/auth/drive.readonly',
  DRIVE_FILE: 'https://www.googleapis.com/auth/drive.file',

  // Profile info
  PROFILE: 'https://www.googleapis.com/auth/userinfo.profile',
  EMAIL: 'https://www.googleapis.com/auth/userinfo.email',
};

/** Default scopes for full integration */
export const DEFAULT_SCOPES = [
  GOOGLE_OAUTH_SCOPES.EMAIL,
  GOOGLE_OAUTH_SCOPES.PROFILE,
  GOOGLE_OAUTH_SCOPES.GMAIL_MODIFY,
  GOOGLE_OAUTH_SCOPES.GMAIL_SEND,
  GOOGLE_OAUTH_SCOPES.CALENDAR_FULL,
  GOOGLE_OAUTH_SCOPES.TASKS_FULL,
  GOOGLE_OAUTH_SCOPES.SHEETS_FULL,
  GOOGLE_OAUTH_SCOPES.SLIDES_FULL,
  GOOGLE_OAUTH_SCOPES.DRIVE_FILE,
];

const DATA_DIR = path.resolve(process.cwd(), 'data', 'oauth-tokens');
const TOKEN_FILE = path.join(DATA_DIR, 'google-oauth.json');
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CALLBACK_PORT = 8766;
const CALLBACK_PATH = '/oauth/google/callback';

// =============================================================================
// HTML Templates
// =============================================================================

const HTML_SUCCESS = `<!DOCTYPE html>
<html>
<head>
  <title>Google Account Connected</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; }
    .container { text-align: center; padding: 2rem; background: rgba(255,255,255,0.1); border-radius: 1rem; backdrop-filter: blur(10px); }
    h1 { color: #4ade80; margin-bottom: 1rem; }
    p { color: rgba(255,255,255,0.9); }
    .email { font-weight: bold; color: #fff; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Google Account Connected</h1>
    <p>You can close this window and return to the application.</p>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>`;

const HTML_ERROR = (error: string) => `<!DOCTYPE html>
<html>
<head>
  <title>Google OAuth Failed</title>
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
    <p>An error occurred during Google authorization.</p>
    <div class="error">${error}</div>
  </div>
</body>
</html>`;

// =============================================================================
// GoogleOAuthService Class
// =============================================================================

export class GoogleOAuthService {
  private config: GoogleOAuthConfig;
  private oauth2Client: Auth.OAuth2Client;
  private callbackServer: Server | null = null;
  private pendingAuths = new Map<string, PendingAuth>();
  private data: GoogleOAuthData;

  constructor(config: GoogleOAuthConfig) {
    this.config = config;
    this.ensureDataDir();
    this.data = this.loadData();

    const redirectUri = this.getCallbackUrl();
    this.oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);

    logger.info('GoogleOAuthService initialized', {
      callbackUrl: redirectUri,
      accountCount: Object.keys(this.data.accounts).length,
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Start the OAuth flow to connect a Google account.
   * Returns the authorization URL that should be opened in a browser.
   */
  async startOAuthFlow(scopes: string[] = DEFAULT_SCOPES): Promise<{
    authUrl: string;
    state: string;
  }> {
    const op = logger.startOperation('startOAuthFlow');

    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store pending auth state
    this.data.pendingStates[state] = {
      codeVerifier,
      createdAt: Date.now(),
      scopes,
    };
    this.saveData();

    // Generate authorization URL
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: codeChallenge,
      prompt: 'consent', // Always prompt for consent to get refresh token
    });

    op.success('OAuth flow started', {
      state: state.substring(0, 8) + '...',
      scopeCount: scopes.length,
    });

    return { authUrl, state };
  }

  /**
   * Start OAuth flow and open browser automatically.
   * Waits for callback and returns the connected account email.
   */
  async connectAccount(scopes: string[] = DEFAULT_SCOPES): Promise<string> {
    const op = logger.startOperation('connectAccount');

    const { authUrl, state } = await this.startOAuthFlow(scopes);

    // Ensure callback server is running
    await this.ensureCallbackServerRunning();

    // Open browser
    const open = (await import('open')).default;

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  🔐 Google Account Authorization Required                       ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║                                                                 ║');
    console.log('║  A browser window will open for you to authorize access.       ║');
    console.log('║  Please sign in with your Google account and grant access.     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('\n');

    await open(authUrl);
    logger.info('Browser opened for Google authorization');

    // Wait for callback
    const code = await this.waitForCallback(state);

    // Exchange code for tokens
    const email = await this.handleCallback(code, state);

    op.success('Account connected', { email });
    return email;
  }

  /**
   * Handle OAuth callback with authorization code.
   * Returns the connected account email.
   */
  async handleCallback(code: string, state: string): Promise<string> {
    const op = logger.startOperation('handleCallback');

    // Validate state
    const pendingState = this.data.pendingStates[state];
    if (!pendingState) {
      op.failure('Invalid or expired state');
      throw new Error('Invalid or expired OAuth state - potential CSRF attack');
    }

    // Check if state is expired (5 minutes)
    if (Date.now() - pendingState.createdAt > CALLBACK_TIMEOUT_MS) {
      delete this.data.pendingStates[state];
      this.saveData();
      op.failure('State expired');
      throw new Error('OAuth state expired - please try again');
    }

    try {
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken({
        code,
        codeVerifier: pendingState.codeVerifier,
      });

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Failed to get tokens from Google');
      }

      // Set credentials to get user info
      this.oauth2Client.setCredentials(tokens);

      // Get user profile
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      const email = userInfo.data.email;
      if (!email) {
        throw new Error('Could not get email from Google profile');
      }

      // Store account
      this.data.accounts[email] = {
        email,
        displayName: userInfo.data.name || undefined,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date || Date.now() + 3600 * 1000,
        scopes: pendingState.scopes,
        connectedAt: Date.now(),
      };

      // Clean up pending state
      delete this.data.pendingStates[state];
      this.saveData();

      op.success('Account connected', { email, displayName: userInfo.data.name });

      return email;
    } catch (error) {
      // Clean up pending state on error
      delete this.data.pendingStates[state];
      this.saveData();

      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get a list of all connected accounts.
   */
  getConnectedAccounts(): Array<{
    email: string;
    displayName?: string;
    connectedAt: number;
    scopes: string[];
  }> {
    return Object.values(this.data.accounts).map((account) => ({
      email: account.email,
      displayName: account.displayName,
      connectedAt: account.connectedAt,
      scopes: account.scopes,
    }));
  }

  /**
   * Check if an account is connected.
   */
  isAccountConnected(email: string): boolean {
    return email in this.data.accounts;
  }

  /**
   * Disconnect a Google account.
   */
  disconnectAccount(email: string): boolean {
    const op = logger.startOperation('disconnectAccount', { email });

    if (!this.data.accounts[email]) {
      op.failure('Account not found');
      return false;
    }

    delete this.data.accounts[email];
    this.saveData();

    op.success('Account disconnected');
    return true;
  }

  /**
   * Add a Google account from externally obtained tokens.
   * Used when sign-in flow also grants integration permissions.
   */
  addAccountFromTokens(params: {
    email: string;
    displayName?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
  }): void {
    const op = logger.startOperation('addAccountFromTokens', { email: params.email });

    this.data.accounts[params.email] = {
      email: params.email,
      displayName: params.displayName,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt: params.expiresAt,
      scopes: params.scopes,
      connectedAt: Date.now(),
    };

    this.saveData();
    op.success('Account added from external tokens');
  }

  /**
   * Get an authenticated OAuth2 client for a specific account.
   * Automatically refreshes tokens if expired.
   */
  async getAuthClient(email: string): Promise<Auth.OAuth2Client> {
    const op = logger.startOperation('getAuthClient', { email });

    const account = this.data.accounts[email];
    if (!account) {
      op.failure('Account not connected');
      throw new Error(
        `Google account ${email} is not connected. Use google_oauth_connect to connect it first.`
      );
    }

    // Create a new OAuth2 client for this account
    const client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.getCallbackUrl()
    );

    // Set credentials
    client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiresAt,
    });

    // Check if token needs refresh (expired or expiring in < 5 min)
    if (Date.now() > account.expiresAt - 5 * 60 * 1000) {
      logger.debug('Token expired or expiring soon, refreshing', { email });

      try {
        const { credentials } = await client.refreshAccessToken();

        // Update stored tokens
        account.accessToken = credentials.access_token || account.accessToken;
        if (credentials.refresh_token) {
          account.refreshToken = credentials.refresh_token;
        }
        account.expiresAt = credentials.expiry_date || Date.now() + 3600 * 1000;
        account.lastRefreshAt = Date.now();
        this.saveData();

        logger.debug('Token refreshed successfully', { email });
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        throw new Error(`Failed to refresh token for ${email}. Please reconnect the account.`);
      }
    }

    op.success('Auth client obtained');
    return client;
  }

  /**
   * Get the default account email (first connected account).
   */
  getDefaultAccount(): string | null {
    const emails = Object.keys(this.data.accounts);
    return emails.length > 0 ? emails[0] : null;
  }

  // ===========================================================================
  // Callback Server
  // ===========================================================================

  /**
   * Ensure the OAuth callback server is running.
   */
  async ensureCallbackServerRunning(): Promise<void> {
    // In production mode, callbacks are handled by main server
    if (this.config.callbackUrl) {
      logger.info('Production mode - callback handled by main server', {
        callbackUrl: this.config.callbackUrl,
      });
      return;
    }

    if (this.callbackServer) return;

    const port = this.config.callbackPort || DEFAULT_CALLBACK_PORT;

    // Check if port is in use
    const portInUse = await this.isPortInUse(port);
    if (portInUse) {
      logger.info('Google OAuth callback server already running on another instance', { port });
      return;
    }

    return new Promise((resolve, reject) => {
      this.callbackServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        this.handleCallbackRequest(req, res);
      });

      this.callbackServer.on('error', (error: Error) => {
        logger.error('Callback server error', { error: error.message });
        reject(error);
      });

      this.callbackServer.listen(port, '127.0.0.1', () => {
        logger.info('Google OAuth callback server started', { port });
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
      logger.info('Google OAuth callback server stopped');
    }

    // Reject all pending auths
    for (const [, pending] of this.pendingAuths) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Callback server stopped'));
    }
    this.pendingAuths.clear();
  }

  private handleCallbackRequest(req: IncomingMessage, res: ServerResponse): void {
    const port = this.config.callbackPort || DEFAULT_CALLBACK_PORT;
    const url = new URL(req.url || '', `http://127.0.0.1:${port}`);

    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    logger.info('Received Google OAuth callback', { hasCode: !!code, state, error });

    if (!state) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(HTML_ERROR('Missing state parameter'));
      return;
    }

    if (error) {
      const errorMsg = errorDescription || error;
      const pending = this.pendingAuths.get(state);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingAuths.delete(state);
        pending.reject(new Error(errorMsg));
      }
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(HTML_ERROR(errorMsg));
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(HTML_ERROR('No authorization code provided'));
      return;
    }

    // Resolve pending auth (for CLI flow that's waiting)
    const pending = this.pendingAuths.get(state);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAuths.delete(state);
      pending.resolve(code);
    }

    // For dashboard flow: perform token exchange here since no one is waiting
    // Check if this state exists in our data (dashboard flow creates it there)
    const pendingState = this.data.pendingStates[state];
    if (pendingState && !pending) {
      // Dashboard flow - handle token exchange directly
      this.handleCallback(code, state)
        .then((email) => {
          logger.info('Dashboard OAuth flow completed', { email });
        })
        .catch((callbackError) => {
          logger.error('Dashboard OAuth flow failed', {
            error: callbackError instanceof Error ? callbackError.message : String(callbackError),
          });
        });
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML_SUCCESS);
  }

  private waitForCallback(state: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingAuths.has(state)) {
          this.pendingAuths.delete(state);
          reject(new Error('OAuth callback timeout - authorization took too long'));
        }
      }, CALLBACK_TIMEOUT_MS);

      this.pendingAuths.set(state, { resolve, reject, timeout });
    });
  }

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net
        .createServer()
        .once('error', () => resolve(true))
        .once('listening', () => {
          tester.once('close', () => resolve(false)).close();
        })
        .listen(port, '127.0.0.1');
    });
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getCallbackUrl(): string {
    if (this.config.callbackUrl) {
      return this.config.callbackUrl;
    }
    const port = this.config.callbackPort || DEFAULT_CALLBACK_PORT;
    return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      logger.info('Created OAuth tokens directory', { path: DATA_DIR });
    }
  }

  private loadData(): GoogleOAuthData {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const content = fs.readFileSync(TOKEN_FILE, 'utf-8');
        const data = JSON.parse(content) as GoogleOAuthData;

        // Clean up expired pending states
        const now = Date.now();
        for (const state of Object.keys(data.pendingStates || {})) {
          if (now - data.pendingStates[state].createdAt > CALLBACK_TIMEOUT_MS) {
            delete data.pendingStates[state];
          }
        }

        return {
          accounts: data.accounts || {},
          pendingStates: data.pendingStates || {},
        };
      }
    } catch (error) {
      logger.warn('Failed to load Google OAuth data', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { accounts: {}, pendingStates: {} };
  }

  private saveData(): void {
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.data, null, 2));
      fs.chmodSync(TOKEN_FILE, 0o600); // Secure permissions
    } catch (error) {
      logger.error('Failed to save Google OAuth data', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }
}

// =============================================================================
// Production Mode Detection
// =============================================================================

/**
 * Check if Google OAuth is in production mode.
 * Production mode is when GOOGLE_OAUTH_CALLBACK_URL is set and uses https.
 */
export const IS_GOOGLE_OAUTH_PRODUCTION = (() => {
  const callbackUrl = process.env.GOOGLE_OAUTH_CALLBACK_URL;
  return callbackUrl ? callbackUrl.startsWith('https://') : false;
})();

// =============================================================================
// Factory Function
// =============================================================================

let googleOAuthService: GoogleOAuthService | null = null;

/**
 * Get or create the GoogleOAuthService singleton.
 */
export function getGoogleOAuthService(config?: GoogleOAuthConfig): GoogleOAuthService {
  if (googleOAuthService) {
    return googleOAuthService;
  }

  if (!config) {
    // Try to load from environment first
    let clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    // Fallback: try to load from credentials file
    if (!clientId || !clientSecret) {
      try {
        const credentialsDir = path.join(process.cwd(), 'credentials');
        const files = fs.readdirSync(credentialsDir);
        const clientSecretFile = files.find(
          (f) => f.startsWith('client_secret_') && f.endsWith('.json')
        );

        if (clientSecretFile) {
          const credPath = path.join(credentialsDir, clientSecretFile);
          const credData = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
          const installed = credData.installed || credData.web;

          if (installed) {
            clientId = installed.client_id;
            clientSecret = installed.client_secret;
            logger.info('Loaded Google OAuth credentials from file', { file: clientSecretFile });
          }
        }
      } catch {
        // Ignore file read errors
      }
    }

    if (!clientId || !clientSecret) {
      throw new Error(
        'Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET environment variables, or place a client_secret_*.json file in the credentials/ directory.'
      );
    }

    config = {
      clientId,
      clientSecret,
      callbackPort: parseInt(
        process.env.GOOGLE_OAUTH_CALLBACK_PORT || String(DEFAULT_CALLBACK_PORT),
        10
      ),
      callbackUrl: process.env.GOOGLE_OAUTH_CALLBACK_URL,
    };
  }

  googleOAuthService = new GoogleOAuthService(config);
  return googleOAuthService;
}

/**
 * Reset the GoogleOAuthService singleton (for testing).
 */
export function resetGoogleOAuthService(): void {
  if (googleOAuthService) {
    googleOAuthService.stopCallbackServer();
    googleOAuthService = null;
  }
}

/**
 * Create a new GoogleOAuthService instance (for testing or multiple instances).
 */
export function createGoogleOAuthService(config: GoogleOAuthConfig): GoogleOAuthService {
  return new GoogleOAuthService(config);
}

/**
 * Handle OAuth callback from Express (for production mode).
 * This async version actually completes the token exchange.
 */
export async function handleGoogleOAuthCallback(
  code: string | null,
  state: string | null,
  error: string | null,
  errorDescription: string | null
): Promise<{ success: boolean; html: string; error?: string }> {
  if (!state) {
    return {
      success: false,
      error: 'Missing state parameter',
      html: HTML_ERROR('Missing state parameter'),
    };
  }

  if (error) {
    const errorMsg = errorDescription || error;
    return { success: false, error: errorMsg, html: HTML_ERROR(errorMsg) };
  }

  if (!code) {
    return {
      success: false,
      error: 'No authorization code',
      html: HTML_ERROR('No authorization code provided'),
    };
  }

  try {
    // Get the service singleton and complete the token exchange
    const service = getGoogleOAuthService();
    const email = await service.handleCallback(code, state);
    logger.info('Production OAuth callback completed successfully', { email });
    return { success: true, html: HTML_SUCCESS };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Token exchange failed';
    logger.error('Production OAuth callback failed', { error: errorMsg });
    return { success: false, error: errorMsg, html: HTML_ERROR(errorMsg) };
  }
}
