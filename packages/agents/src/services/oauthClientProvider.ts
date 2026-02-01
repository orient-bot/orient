/**
 * OAuth Client Provider for MCP Server Authentication
 *
 * Implements the OAuthClientProvider interface from MCP SDK to handle
 * OAuth 2.1 authentication with browser-based approval flow.
 * Used for connecting to remote MCP servers like Atlassian.
 *
 * Based on OpenCode's implementation:
 *
 * Exported via @orient-bot/integrations package.
 * - Uses localhost callback URL for OAuth flow
 * - Supports dynamic client registration
 * - Implements PKCE (code verifier) management
 * - Implements OAuth state parameter for CSRF protection
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createServiceLogger } from '@orient-bot/core';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

const logger = createServiceLogger('oauth-provider');

// OAuth callback configuration
// In production, use OAUTH_CALLBACK_URL env var (e.g., https://app.example.com/oauth/callback)
// In local/dev, defaults to http://localhost:3334/oauth/callback (Atlassian MCP requirement)
// Note: Atlassian MCP Server specifically requires localhost:3334 for desktop clients
const OAUTH_CALLBACK_PORT = parseInt(process.env.OAUTH_CALLBACK_PORT || '3334', 10);
const OAUTH_CALLBACK_PATH = '/oauth/callback';

/**
 * Get the OAuth callback URL based on environment
 */
function getOAuthCallbackUrl(): string {
  // Check for explicit URL override (production)
  if (process.env.OAUTH_CALLBACK_URL) {
    const url = process.env.OAUTH_CALLBACK_URL;
    logger.info('Using production OAuth callback URL', { url });
    return url;
  }

  // Default to localhost for development (Atlassian MCP requires localhost, not 127.0.0.1)
  const localUrl = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`;
  logger.info('Using local OAuth callback URL', { url: localUrl });
  return localUrl;
}

// Cache the callback URL at module load time
const OAUTH_CALLBACK_URL = getOAuthCallbackUrl();
const IS_PRODUCTION_OAUTH = OAUTH_CALLBACK_URL.startsWith('https://');

/**
 * Get the OAuth data directory based on environment.
 * Priority:
 * 1. XDG_DATA_HOME (set by opencode-env.sh in dev, PM2 in prod)
 * 2. OPENCODE_TEST_HOME (alternative isolation)
 * 3. ORIENT_HOME (production installation)
 * 4. Default: ~/.local/share/opencode (standard XDG location)
 */
function getOAuthDataDir(): string {
  // 1. Check XDG_DATA_HOME (set by opencode-env.sh in dev, PM2 in prod)
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, 'opencode');
  }

  // 2. Check OPENCODE_TEST_HOME (alternative isolation)
  if (process.env.OPENCODE_TEST_HOME) {
    return path.join(process.env.OPENCODE_TEST_HOME, 'data', 'opencode');
  }

  // 3. Check ORIENT_HOME (production installation)
  if (process.env.ORIENT_HOME) {
    return path.join(process.env.ORIENT_HOME, 'opencode', 'data', 'opencode');
  }

  // 4. Default: ~/.local/share/opencode (standard XDG location)
  const homeDir = process.env.HOME || os.homedir();
  return path.join(homeDir, '.local', 'share', 'opencode');
}

// Token storage file path - uses XDG environment variables for proper isolation
const DATA_DIR = getOAuthDataDir();
const AUTH_FILE = path.join(DATA_DIR, 'mcp-auth.json');

/**
 * Stored OAuth data per MCP server
 */
interface McpAuthEntry {
  tokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
  };
  clientInfo?: {
    clientId: string;
    clientSecret?: string;
    clientIdIssuedAt?: number;
    clientSecretExpiresAt?: number;
  };
  codeVerifier?: string;
  oauthState?: string;
  serverUrl?: string; // Track the URL these credentials are for
}

interface McpAuthData {
  [mcpName: string]: McpAuthEntry;
}

/**
 * Promise resolver for the OAuth callback
 */
interface PendingAuth {
  resolve: (code: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// Singleton callback server and pending auths
let callbackServer: Server | null = null;
const pendingAuths = new Map<string, PendingAuth>();
// Track pending states for SDK-driven OAuth flows (where we don't need resolve/reject)
const pendingStates = new Map<string, { mcpName: string; timestamp: number }>();
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Store captured authorization URLs from the SDK
const capturedAuthUrls = new Map<string, string>();

// Flag to suppress auto-opening browser (set by dashboard when handling OAuth via API)
let suppressBrowserOpen = false;

/**
 * Set whether to suppress auto-opening browser during OAuth flow.
 * Used by dashboard to prevent double browser windows.
 */
export function setSuppressBrowserOpen(suppress: boolean): void {
  suppressBrowserOpen = suppress;
}

/**
 * Get a captured authorization URL for an MCP server
 */
export function getCapturedAuthUrl(mcpName: string): string | undefined {
  const url = capturedAuthUrls.get(mcpName);
  if (url) {
    capturedAuthUrls.delete(mcpName);
    return url;
  }
  return undefined;
}

/**
 * Register a pending OAuth state for callback validation.
 * Used when the MCP SDK drives the OAuth flow.
 */
function registerPendingAuth(state: string, mcpName: string): void {
  pendingStates.set(state, { mcpName, timestamp: Date.now() });
  logger.info('Registered pending OAuth state', {
    mcpName,
    statePrefix: state.substring(0, 8) + '...',
  });

  // Auto-cleanup after timeout
  setTimeout(() => {
    if (pendingStates.has(state)) {
      pendingStates.delete(state);
      logger.debug('Cleaned up expired OAuth state', {
        statePrefix: state.substring(0, 8) + '...',
      });
    }
  }, CALLBACK_TIMEOUT_MS);
}

// Store authorization codes received from callbacks (for SDK-driven flows)
const receivedAuthCodes = new Map<string, { code: string; state: string; timestamp: number }>();

/**
 * Store an authorization code received from a callback
 */
function storeAuthorizationCode(mcpName: string, code: string, state: string): void {
  receivedAuthCodes.set(mcpName, { code, state, timestamp: Date.now() });
  logger.info('Stored authorization code', { mcpName });

  // Auto-cleanup after timeout
  setTimeout(() => {
    if (receivedAuthCodes.has(mcpName)) {
      receivedAuthCodes.delete(mcpName);
    }
  }, CALLBACK_TIMEOUT_MS);
}

/**
 * Check if an authorization code is available for an MCP server
 */
export function getReceivedAuthCode(mcpName: string): { code: string; state: string } | undefined {
  const entry = receivedAuthCodes.get(mcpName);
  if (entry) {
    receivedAuthCodes.delete(mcpName);
    return { code: entry.code, state: entry.state };
  }
  return undefined;
}

/**
 * Wait for an authorization code for a specific MCP server.
 * Returns the authorization code when the callback is received.
 */
export function waitForAuthCode(mcpName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check if we already have a code
    const existing = getReceivedAuthCode(mcpName);
    if (existing) {
      resolve(existing.code);
      return;
    }

    // Poll for the code
    const startTime = Date.now();
    const pollInterval = setInterval(() => {
      const entry = receivedAuthCodes.get(mcpName);
      if (entry) {
        clearInterval(pollInterval);
        receivedAuthCodes.delete(mcpName);
        resolve(entry.code);
      } else if (Date.now() - startTime > CALLBACK_TIMEOUT_MS) {
        clearInterval(pollInterval);
        reject(new Error('Timeout waiting for OAuth authorization'));
      }
    }, 500);
  });
}

/**
 * OAuth Client Provider implementation for MCP authentication
 *
 * Features:
 * - Persistent token storage in data/oauth-tokens/mcp-auth.json
 * - Browser-based OAuth flow with local callback server
 * - Dynamic client registration support
 * - PKCE code verifier management
 * - OAuth state parameter for CSRF protection
 */
export class MCPOAuthClientProvider implements OAuthClientProvider {
  private mcpName: string;
  private serverUrl: string;

  constructor(serverUrl: string, mcpName: string) {
    this.serverUrl = serverUrl;
    this.mcpName = mcpName;
    this.ensureDataDir();
  }

  /**
   * Ensure the data directory exists
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      logger.info('Created OAuth tokens directory', { path: DATA_DIR });
    }
  }

  /**
   * Read all auth data from storage
   */
  private readAuthData(): McpAuthData {
    try {
      if (fs.existsSync(AUTH_FILE)) {
        const data = fs.readFileSync(AUTH_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn('Failed to read auth data', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {};
  }

  /**
   * Write auth data to storage
   */
  private writeAuthData(data: McpAuthData): void {
    try {
      fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
      fs.chmodSync(AUTH_FILE, 0o600); // Secure permissions
      logger.debug('Wrote auth data', { path: AUTH_FILE });
    } catch (error) {
      logger.error('Failed to write auth data', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get auth entry for this MCP server
   */
  private getEntry(): McpAuthEntry | undefined {
    const data = this.readAuthData();
    return data[this.mcpName];
  }

  /**
   * Get auth entry and validate it's for the correct URL
   */
  private getEntryForUrl(): McpAuthEntry | undefined {
    const entry = this.getEntry();
    if (!entry) return undefined;

    // If no serverUrl is stored, this is from an old version - consider it invalid
    if (!entry.serverUrl) return undefined;

    // If URL has changed, credentials are invalid
    if (entry.serverUrl !== this.serverUrl) return undefined;

    return entry;
  }

  /**
   * Update auth entry
   */
  private updateEntry(updates: Partial<McpAuthEntry>): void {
    const data = this.readAuthData();
    const existing = data[this.mcpName] || {};
    data[this.mcpName] = {
      ...existing,
      ...updates,
      serverUrl: this.serverUrl, // Always update serverUrl
    };
    this.writeAuthData(data);
  }

  /**
   * The redirect URL for OAuth callbacks.
   * Uses OAUTH_CALLBACK_URL env var in production, localhost in development.
   */
  get redirectUrl(): string {
    return OAUTH_CALLBACK_URL;
  }

  /**
   * Client metadata for OAuth dynamic registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: 'Orient',
      client_uri: 'https://github.com/orient-bot/orient',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  /**
   * Load client information from storage
   * Returns undefined to trigger dynamic registration if not found
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    // Check stored client info (from dynamic registration)
    const entry = this.getEntryForUrl();
    if (entry?.clientInfo) {
      // Check if client secret has expired
      if (
        entry.clientInfo.clientSecretExpiresAt &&
        entry.clientInfo.clientSecretExpiresAt < Date.now() / 1000
      ) {
        logger.info('Client secret expired, need to re-register', { mcpName: this.mcpName });
        return undefined;
      }
      return {
        client_id: entry.clientInfo.clientId,
        client_secret: entry.clientInfo.clientSecret,
      };
    }

    // No client info or URL changed - will trigger dynamic registration
    return undefined;
  }

  /**
   * Save client information from dynamic registration
   */
  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    this.updateEntry({
      clientInfo: {
        clientId: info.client_id,
        clientSecret: info.client_secret,
        clientIdIssuedAt: info.client_id_issued_at,
        clientSecretExpiresAt: info.client_secret_expires_at,
      },
    });
    logger.info('Saved dynamically registered client', {
      mcpName: this.mcpName,
      clientId: info.client_id,
    });
  }

  /**
   * Load OAuth tokens from storage
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    const entry = this.getEntryForUrl();
    if (!entry?.tokens) return undefined;

    return {
      access_token: entry.tokens.accessToken,
      token_type: 'Bearer',
      refresh_token: entry.tokens.refreshToken,
      expires_in: entry.tokens.expiresAt
        ? Math.max(0, Math.floor(entry.tokens.expiresAt - Date.now() / 1000))
        : undefined,
      scope: entry.tokens.scope,
    };
  }

  /**
   * Save OAuth tokens to storage
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.updateEntry({
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Date.now() / 1000 + tokens.expires_in : undefined,
        scope: tokens.scope,
      },
    });
    logger.info('Saved OAuth tokens', { mcpName: this.mcpName });
  }

  /**
   * Redirect to authorization URL.
   *
   * In CLI mode: Opens the browser and returns immediately.
   * In Dashboard/API mode: Captures the URL for later retrieval via getCapturedAuthUrl().
   *
   * The callback will be handled by the callback server and the authorization code
   * stored for later use.
   *
   * The caller (MCP SDK) will throw UnauthorizedError after this returns,
   * which should be caught and handled by waiting for the callback and
   * calling transport.finishAuth(code).
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const fullUrl = authorizationUrl.toString();
    logger.info('OAuth authorization URL generated', {
      mcpName: this.mcpName,
      url: fullUrl.substring(0, 150) + '...',
      hasClientId: authorizationUrl.searchParams.has('client_id'),
      hasCodeChallenge: authorizationUrl.searchParams.has('code_challenge'),
    });

    // ALWAYS capture the URL for API/Dashboard use
    capturedAuthUrls.set(this.mcpName, fullUrl);

    // Ensure callback server is running (for local dev)
    if (!IS_PRODUCTION_OAUTH) {
      await ensureCallbackServerRunning();
    }

    // Extract state from the authorization URL and register it for callback validation
    const state = authorizationUrl.searchParams.get('state');
    if (state) {
      registerPendingAuth(state, this.mcpName);
    }

    // Don't auto-open browser if:
    // - Production mode (API will return URL to frontend)
    // - Dashboard/API is handling the flow (suppressBrowserOpen flag is set)
    if (IS_PRODUCTION_OAUTH || suppressBrowserOpen) {
      logger.info('Captured auth URL for API (browser open suppressed)', { mcpName: this.mcpName });
      return;
    }

    // In local dev CLI mode, open the browser directly
    const open = (await import('open')).default;

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  🔐 OAuth Authorization Required                                ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Server: ${this.mcpName.padEnd(52)}║`);
    console.log(`║  Callback: ${this.redirectUrl.padEnd(50)}║`);
    console.log('║                                                                 ║');
    console.log('║  A browser window will open for you to authorize access.       ║');
    console.log('║  Please approve the request in your browser.                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('\n');

    // Open the browser and return immediately
    // The SDK will throw UnauthorizedError which should be caught
    await open(fullUrl);
    logger.info('Browser opened for authorization', { mcpName: this.mcpName });
  }

  /**
   * Save the PKCE code verifier
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.updateEntry({ codeVerifier });
    logger.debug('Saved code verifier', { mcpName: this.mcpName });
  }

  /**
   * Load the PKCE code verifier
   */
  async codeVerifier(): Promise<string> {
    const entry = this.getEntry();
    if (!entry?.codeVerifier) {
      throw new Error(`No code verifier saved for MCP server: ${this.mcpName}`);
    }
    return entry.codeVerifier;
  }

  /**
   * Save the OAuth state parameter
   */
  async saveState(state: string): Promise<void> {
    this.updateEntry({ oauthState: state });
    logger.debug('Saved OAuth state', { mcpName: this.mcpName });
  }

  /**
   * Generate and return OAuth state parameter for CSRF protection.
   * The state is generated on-demand and saved for later validation.
   */
  async state(): Promise<string> {
    // Check if we already have a state saved
    const entry = this.getEntry();
    if (entry?.oauthState) {
      return entry.oauthState;
    }

    // Generate a new cryptographically secure state
    const newState = crypto.randomBytes(32).toString('hex');
    await this.saveState(newState);
    logger.info('Generated new OAuth state', {
      mcpName: this.mcpName,
      statePrefix: newState.substring(0, 8) + '...',
    });
    return newState;
  }

  /**
   * Invalidate stored credentials
   */
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void {
    logger.info('Invalidating credentials', { mcpName: this.mcpName, scope });

    const data = this.readAuthData();
    const entry = data[this.mcpName];

    if (!entry) return;

    if (scope === 'all') {
      delete data[this.mcpName];
    } else {
      if (scope === 'tokens') delete entry.tokens;
      if (scope === 'client') delete entry.clientInfo;
      if (scope === 'verifier') delete entry.codeVerifier;
      data[this.mcpName] = entry;
    }

    this.writeAuthData(data);
  }

  /**
   * Check if we have valid tokens
   */
  async hasValidTokens(): Promise<boolean> {
    const entry = this.getEntryForUrl();
    if (!entry?.tokens) return false;

    // Check if tokens have expired
    if (entry.tokens.expiresAt && entry.tokens.expiresAt < Date.now() / 1000) {
      // Tokens expired, but we might have a refresh token
      return !!entry.tokens.refreshToken;
    }

    return true;
  }
}

// HTML templates for callback responses
const HTML_SUCCESS = `<!DOCTYPE html>
<html>
<head>
  <title>Orient - Authorization Successful</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #4ade80; margin-bottom: 1rem; }
    p { color: #aaa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Authorization Successful</h1>
    <p>You can close this window and return to the application.</p>
  </div>
  <script>
    // Notify parent window that OAuth completed
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth-complete', success: true, provider: 'atlassian' }, '*');
    }
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`;

const HTML_ERROR = (error: string) => `<!DOCTYPE html>
<html>
<head>
  <title>Orient - Authorization Failed</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #f87171; margin-bottom: 1rem; }
    p { color: #aaa; }
    .error { color: #fca5a5; font-family: monospace; margin-top: 1rem; padding: 1rem; background: rgba(248,113,113,0.1); border-radius: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Authorization Failed</h1>
    <p>An error occurred during authorization.</p>
    <div class="error">${error}</div>
  </div>
</body>
</html>`;

/**
 * Ensure the OAuth callback server is running.
 * In production mode (HTTPS callback URL), the callback is handled by nginx/main server,
 * so we don't need to start a local callback server.
 */
export async function ensureCallbackServerRunning(): Promise<void> {
  // In production mode, callbacks are handled by nginx/main server
  if (IS_PRODUCTION_OAUTH) {
    logger.info('Production mode - callback handled by main server', {
      callbackUrl: OAUTH_CALLBACK_URL,
    });
    return;
  }

  if (callbackServer) return;

  // Check if port is already in use
  const portInUse = await isPortInUse(OAUTH_CALLBACK_PORT);
  if (portInUse) {
    logger.info('OAuth callback server already running on another instance', {
      port: OAUTH_CALLBACK_PORT,
    });
    return;
  }

  return new Promise((resolve, reject) => {
    callbackServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      handleOAuthCallback(req, res);
    });

    callbackServer.on('error', (error: Error) => {
      logger.error('Callback server error', { error: error.message });
      reject(error);
    });

    callbackServer.listen(OAUTH_CALLBACK_PORT, 'localhost', () => {
      logger.info('OAuth callback server started', { port: OAUTH_CALLBACK_PORT });
      resolve();
    });
  });
}

/**
 * Check if a port is in use
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.once('close', () => resolve(false)).close();
      })
      .listen(port, 'localhost');
  });
}

/**
 * Handle OAuth callback request
 */
function handleOAuthCallback(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '', `http://localhost:${OAUTH_CALLBACK_PORT}`);

  if (url.pathname !== OAUTH_CALLBACK_PATH) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  logger.info('Received OAuth callback', { hasCode: !!code, state, error });

  // Enforce state parameter presence
  if (!state) {
    const errorMsg = 'Missing required state parameter - potential CSRF attack';
    logger.error('OAuth callback missing state parameter', { url: url.toString() });
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(HTML_ERROR(errorMsg));
    return;
  }

  if (error) {
    const errorMsg = errorDescription || error;
    if (pendingAuths.has(state)) {
      const pending = pendingAuths.get(state)!;
      clearTimeout(pending.timeout);
      pendingAuths.delete(state);
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

  // Validate state parameter - check both maps
  const hasPendingAuth = pendingAuths.has(state);
  const hasPendingState = pendingStates.has(state);

  if (!hasPendingAuth && !hasPendingState) {
    const errorMsg = 'Invalid or expired state parameter - potential CSRF attack';
    logger.error('OAuth callback with invalid state', {
      state: state.substring(0, 16) + '...',
      pendingAuthCount: pendingAuths.size,
      pendingStateCount: pendingStates.size,
    });
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(HTML_ERROR(errorMsg));
    return;
  }

  // Handle SDK-driven flow (pendingStates)
  if (hasPendingState) {
    const stateInfo = pendingStates.get(state)!;
    pendingStates.delete(state);

    // Store the authorization code for the SDK to pick up
    storeAuthorizationCode(stateInfo.mcpName, code, state);

    logger.info('OAuth callback received (SDK flow)', { mcpName: stateInfo.mcpName });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML_SUCCESS);
    return;
  }

  // Handle manual flow (pendingAuths)
  const pending = pendingAuths.get(state)!;
  clearTimeout(pending.timeout);
  pendingAuths.delete(state);
  pending.resolve(code);

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML_SUCCESS);
}

/**
 * Wait for OAuth callback with the given state
 */
export function waitForOAuthCallback(oauthState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingAuths.has(oauthState)) {
        pendingAuths.delete(oauthState);
        reject(new Error('OAuth callback timeout - authorization took too long'));
      }
    }, CALLBACK_TIMEOUT_MS);

    pendingAuths.set(oauthState, { resolve, reject, timeout });
  });
}

/**
 * Cancel pending OAuth flow
 */
export function cancelPendingOAuth(oauthState: string): void {
  const pending = pendingAuths.get(oauthState);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingAuths.delete(oauthState);
    pending.reject(new Error('Authorization cancelled'));
  }
}

/**
 * Stop the OAuth callback server
 */
export function stopCallbackServer(): void {
  if (callbackServer) {
    callbackServer.close();
    callbackServer = null;
    logger.info('OAuth callback server stopped');
  }

  for (const pending of pendingAuths.values()) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('OAuth callback server stopped'));
  }
  pendingAuths.clear();
}

/**
 * Factory function to create an OAuth provider for a specific MCP server
 */
export function createOAuthProvider(serverUrl: string, serverName: string): MCPOAuthClientProvider {
  return new MCPOAuthClientProvider(serverUrl, serverName);
}

/**
 * OAuth callback configuration for display purposes
 */
export interface OAuthCallbackConfig {
  port: number;
  redirectUrl: string;
  isProduction: boolean;
}

/**
 * Get the current OAuth callback configuration
 */
export function getCallbackConfig(): OAuthCallbackConfig {
  return {
    port: OAUTH_CALLBACK_PORT,
    redirectUrl: OAUTH_CALLBACK_URL,
    isProduction: IS_PRODUCTION_OAUTH,
  };
}

/**
 * Handle OAuth callback from Express (for production mode).
 * Returns { success: true, html } on success or { success: false, error, html } on failure.
 */
export function handleProductionOAuthCallback(
  code: string | null,
  state: string | null,
  error: string | null,
  errorDescription: string | null
): { success: boolean; html: string; error?: string } {
  logger.info('Processing production OAuth callback', {
    hasCode: !!code,
    state: state?.substring(0, 16),
    error,
  });

  // Enforce state parameter presence
  if (!state) {
    const errorMsg = 'Missing required state parameter - potential CSRF attack';
    logger.error('OAuth callback missing state parameter');
    return { success: false, error: errorMsg, html: HTML_ERROR(errorMsg) };
  }

  if (error) {
    const errorMsg = errorDescription || error;
    if (pendingAuths.has(state)) {
      const pending = pendingAuths.get(state)!;
      clearTimeout(pending.timeout);
      pendingAuths.delete(state);
      pending.reject(new Error(errorMsg));
    }
    return { success: false, error: errorMsg, html: HTML_ERROR(errorMsg) };
  }

  if (!code) {
    return {
      success: false,
      error: 'No authorization code provided',
      html: HTML_ERROR('No authorization code provided'),
    };
  }

  // Validate state parameter - check both maps
  const hasPendingAuth = pendingAuths.has(state);
  const hasPendingState = pendingStates.has(state);

  if (!hasPendingAuth && !hasPendingState) {
    const errorMsg = 'Invalid or expired state parameter - potential CSRF attack';
    logger.error('OAuth callback with invalid state', {
      state: state.substring(0, 16) + '...',
      pendingAuthCount: pendingAuths.size,
      pendingStateCount: pendingStates.size,
    });
    return { success: false, error: errorMsg, html: HTML_ERROR(errorMsg) };
  }

  // Handle SDK-driven flow (pendingStates)
  if (hasPendingState) {
    const stateInfo = pendingStates.get(state)!;
    pendingStates.delete(state);

    // Store the authorization code for the SDK to pick up
    storeAuthorizationCode(stateInfo.mcpName, code, state);

    logger.info('OAuth callback processed (SDK flow)', { mcpName: stateInfo.mcpName });
    return { success: true, html: HTML_SUCCESS };
  }

  // Handle manual flow (pendingAuths)
  const pending = pendingAuths.get(state)!;
  clearTimeout(pending.timeout);
  pendingAuths.delete(state);
  pending.resolve(code);

  return { success: true, html: HTML_SUCCESS };
}

// Export constants for external use
export { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH, OAUTH_CALLBACK_URL, IS_PRODUCTION_OAUTH };
