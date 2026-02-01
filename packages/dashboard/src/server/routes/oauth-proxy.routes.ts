/**
 * OAuth Proxy Routes
 *
 * Production server endpoints for Google OAuth proxy.
 * Allows external instances to authenticate through Orient's shared OAuth client.
 *
 * Flow:
 * 1. Local instance calls POST /start with session ID and PKCE challenge
 * 2. Production returns Google auth URL
 * 3. User completes OAuth consent in browser
 * 4. Google redirects to GET /callback
 * 5. Production stores encrypted tokens
 * 6. Local instance polls GET/POST /tokens/:session_id
 * 7. Production returns tokens (one-time) with PKCE validation
 * 8. For refreshes, local calls POST /refresh
 */

import { Router, Request, Response } from 'express';
import { google, Auth } from 'googleapis';
import { CodeChallengeMethod } from 'google-auth-library';
import crypto from 'crypto';
import { createServiceLogger } from '@orient-bot/core';
import { createSecretsService, createOAuthProxyService } from '@orient-bot/database-services';
import { DEFAULT_SCOPES } from '@orient-bot/integrations';

const logger = createServiceLogger('oauth-proxy-routes');

// Rate limiting (simple in-memory)
const rateLimits = {
  start: new Map<string, number[]>(), // IP -> timestamps
  poll: new Map<string, number[]>(),
  refresh: new Map<string, number[]>(),
};

const RATE_LIMITS = {
  start: { max: 10, windowMs: 60 * 1000 }, // 10 per minute
  poll: { max: 60, windowMs: 60 * 1000 }, // 60 per minute (1 per second avg)
  refresh: { max: 60, windowMs: 60 * 60 * 1000 }, // 60 per hour
};

function checkRateLimit(
  type: keyof typeof rateLimits,
  ip: string
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const limit = RATE_LIMITS[type];
  const timestamps = rateLimits[type].get(ip) || [];

  // Remove old timestamps
  const recentTimestamps = timestamps.filter((t) => now - t < limit.windowMs);

  if (recentTimestamps.length >= limit.max) {
    const oldestInWindow = Math.min(...recentTimestamps);
    const retryAfter = Math.ceil((oldestInWindow + limit.windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  recentTimestamps.push(now);
  rateLimits[type].set(ip, recentTimestamps);
  return { allowed: true };
}

// Cleanup rate limit maps periodically
setInterval(
  () => {
    const now = Date.now();
    for (const [type, map] of Object.entries(rateLimits)) {
      const limit = RATE_LIMITS[type as keyof typeof RATE_LIMITS];
      for (const [ip, timestamps] of map.entries()) {
        const recent = timestamps.filter((t: number) => now - t < limit.windowMs);
        if (recent.length === 0) {
          map.delete(ip);
        } else {
          map.set(ip, recent);
        }
      }
    }
  },
  5 * 60 * 1000
);

/**
 * Get Google OAuth credentials from secrets database or environment
 */
async function getGoogleCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const secrets = createSecretsService();

  try {
    let clientId = await secrets.getSecret('GOOGLE_OAUTH_CLIENT_ID');
    let clientSecret = await secrets.getSecret('GOOGLE_OAUTH_CLIENT_SECRET');

    if (!clientId) clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || null;
    if (!clientSecret) clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || null;

    if (clientId && clientSecret) {
      return { clientId, clientSecret };
    }
    return null;
  } catch (error) {
    logger.error('Failed to load Google OAuth credentials', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get the callback URL for OAuth proxy
 */
function getProxyCallbackUrl(): string {
  // Allow override for testing
  if (process.env.GOOGLE_OAUTH_PROXY_CALLBACK_URL) {
    return process.env.GOOGLE_OAUTH_PROXY_CALLBACK_URL;
  }

  const appDomain = process.env.ORIENT_APP_DOMAIN;
  if (appDomain) {
    return `https://${appDomain}/api/oauth/proxy/callback`;
  }

  // Fallback for local testing
  const port = process.env.DASHBOARD_PORT || '4098';
  return `http://localhost:${port}/api/oauth/proxy/callback`;
}

// HTML Templates
const HTML_SUCCESS = `<!DOCTYPE html>
<html>
<head>
  <title>Google Account Connected</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; }
    .container { text-align: center; padding: 2rem; background: rgba(255,255,255,0.1); border-radius: 1rem; backdrop-filter: blur(10px); max-width: 400px; }
    h1 { color: #4ade80; margin-bottom: 1rem; }
    p { color: rgba(255,255,255,0.9); line-height: 1.6; }
    .note { margin-top: 1.5rem; font-size: 0.9rem; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Google Account Connected</h1>
    <p>Your Google account has been successfully connected.</p>
    <p class="note">You can close this window and return to your terminal.</p>
  </div>
</body>
</html>`;

const HTML_ERROR = (error: string) => `<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #f87171 0%, #dc2626 100%); color: #fff; }
    .container { text-align: center; padding: 2rem; background: rgba(255,255,255,0.1); border-radius: 1rem; backdrop-filter: blur(10px); max-width: 400px; }
    h1 { color: #fef2f2; margin-bottom: 1rem; }
    p { color: rgba(255,255,255,0.9); line-height: 1.6; }
    .error { font-family: monospace; margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem; word-break: break-word; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connection Failed</h1>
    <p>An error occurred while connecting your Google account.</p>
    <div class="error">${error}</div>
  </div>
</body>
</html>`;

/**
 * Create OAuth proxy routes
 */
export function createOAuthProxyRoutes(): Router {
  const router = Router();
  const proxyService = createOAuthProxyService();

  let oauth2Client: Auth.OAuth2Client | null = null;
  let isConfigured = false;
  let credentials: { clientId: string; clientSecret: string } | null = null;

  // Initialize OAuth client asynchronously
  const initPromise = getGoogleCredentials().then((creds) => {
    if (!creds) {
      logger.warn('OAuth proxy not configured - missing Google credentials');
      return;
    }

    credentials = creds;
    const callbackUrl = getProxyCallbackUrl();
    oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, callbackUrl);
    isConfigured = true;

    logger.info('OAuth proxy routes initialized', { callbackUrl });
  });

  // Check if proxy is enabled
  const isProxyEnabled = () => {
    return process.env.ENABLE_OAUTH_PROXY === 'true';
  };

  /**
   * POST /api/oauth/proxy/start
   *
   * Start OAuth flow for external instance.
   * Receives session ID and PKCE challenge, returns Google auth URL.
   */
  router.post('/start', async (req: Request, res: Response) => {
    // Check if proxy is enabled
    if (!isProxyEnabled()) {
      return res.status(403).json({ success: false, error: 'OAuth proxy is not enabled' });
    }

    // Rate limiting
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rateCheck = checkRateLimit('start', ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: rateCheck.retryAfter,
      });
    }

    await initPromise;

    if (!isConfigured || !oauth2Client) {
      return res.status(503).json({
        success: false,
        error: 'OAuth proxy not configured - missing Google credentials',
      });
    }

    const { sessionId, codeChallenge, scopes } = req.body;

    // Validate input
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length !== 64) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sessionId - must be 64 character hex string',
      });
    }

    if (!codeChallenge || typeof codeChallenge !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing codeChallenge',
      });
    }

    const requestedScopes = Array.isArray(scopes) ? scopes : DEFAULT_SCOPES;

    try {
      // Create session in database
      await proxyService.createSession({
        sessionId,
        codeChallenge,
        scopes: requestedScopes,
      });

      // Generate authorization URL
      // Use sessionId as state for CSRF protection
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: requestedScopes,
        state: sessionId,
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: codeChallenge,
        prompt: 'consent',
      });

      logger.info('OAuth proxy session started', {
        sessionId: sessionId.substring(0, 8) + '...',
        scopeCount: requestedScopes.length,
      });

      res.json({ success: true, authUrl });
    } catch (error) {
      logger.error('Failed to start OAuth proxy session', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to start OAuth session',
      });
    }
  });

  /**
   * GET /api/oauth/proxy/callback
   *
   * Handle Google OAuth callback.
   * Exchange code for tokens and store encrypted in database.
   */
  router.get('/callback', async (req: Request, res: Response) => {
    await initPromise;

    if (!isConfigured || !oauth2Client || !credentials) {
      return res.status(503).send(HTML_ERROR('OAuth proxy not configured'));
    }

    const { code, state, error, error_description } = req.query;

    // Handle OAuth error
    if (error) {
      const errorMsg = (error_description as string) || (error as string);
      logger.warn('OAuth proxy callback received error', { error: errorMsg });

      // Mark session as expired if we have a state
      if (state && typeof state === 'string') {
        await proxyService.expireSession(state).catch(() => {});
      }

      return res.status(400).send(HTML_ERROR(errorMsg));
    }

    // Validate state (which is the sessionId)
    if (!state || typeof state !== 'string') {
      logger.warn('OAuth proxy callback missing state parameter');
      return res.status(400).send(HTML_ERROR('Missing state parameter'));
    }

    const sessionId = state;

    // Check if session exists and is pending
    const session = await proxyService.getSession(sessionId);
    if (!session) {
      logger.warn('OAuth proxy callback for unknown session', { sessionId });
      return res.status(400).send(HTML_ERROR('Invalid or expired session'));
    }

    if (session.status !== 'pending') {
      logger.warn('OAuth proxy callback for non-pending session', {
        sessionId,
        status: session.status,
      });
      return res.status(400).send(HTML_ERROR('Session already completed or expired'));
    }

    // Validate code
    if (!code || typeof code !== 'string') {
      logger.warn('OAuth proxy callback missing code parameter');
      return res.status(400).send(HTML_ERROR('No authorization code provided'));
    }

    try {
      // Create a fresh OAuth client with the code challenge from the session
      // Note: Google expects the challenge, not verifier, on token exchange
      // But we stored the challenge and the local client has the verifier
      // The PKCE validation happens on Google's side during getToken

      // Create a temporary client for the token exchange
      // The code_verifier needs to match the code_challenge from auth URL
      // Since we don't have the verifier (it's on the local instance),
      // and Google already validated PKCE during auth, we just exchange the code
      const tempClient = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        getProxyCallbackUrl()
      );

      // Exchange code for tokens
      // Note: We're not passing codeVerifier here because the PKCE flow
      // was initiated by the local client. Google validates the challenge
      // at authorization time, and we complete the exchange here.
      const { tokens } = await tempClient.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Failed to get tokens from Google');
      }

      // Get user info
      tempClient.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: tempClient });
      const userInfo = await oauth2.userinfo.get();

      const email = userInfo.data.email;
      if (!email) {
        throw new Error('Could not get email from Google profile');
      }

      // Store tokens in session (encrypted)
      await proxyService.completeSession({
        sessionId,
        tokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date || Date.now() + 3600 * 1000,
          scopes: session.scopes,
          email,
        },
      });

      logger.info('OAuth proxy session completed', {
        sessionId: sessionId.substring(0, 8) + '...',
        email,
      });

      res.send(HTML_SUCCESS);
    } catch (error) {
      logger.error('OAuth proxy callback failed', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      // Mark session as expired on error
      await proxyService.expireSession(sessionId).catch(() => {});

      res
        .status(500)
        .send(HTML_ERROR(error instanceof Error ? error.message : 'Token exchange failed'));
    }
  });

  /**
   * POST /api/oauth/proxy/tokens/:session_id
   *
   * Retrieve tokens for a completed session.
   * Requires PKCE code verifier for validation.
   * Tokens are deleted after retrieval (one-time).
   */
  router.post('/tokens/:session_id', async (req: Request, res: Response) => {
    // Check if proxy is enabled
    if (!isProxyEnabled()) {
      return res.status(403).json({ success: false, error: 'OAuth proxy is not enabled' });
    }

    // Rate limiting
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rateCheck = checkRateLimit('poll', ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: rateCheck.retryAfter,
      });
    }

    const { session_id: sessionId } = req.params;
    const { codeVerifier } = req.body;

    if (!sessionId || !codeVerifier) {
      return res.status(400).json({
        success: false,
        error: 'Missing sessionId or codeVerifier',
      });
    }

    try {
      // Check if session is completed (for polling)
      const session = await proxyService.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      if (session.status === 'pending') {
        // Still waiting for user to complete consent
        return res.json({
          success: false,
          status: 'pending',
        });
      }

      if (session.status === 'expired' || session.status === 'retrieved') {
        return res.json({
          success: false,
          status: 'expired',
          error: 'Session expired or already retrieved',
        });
      }

      // Session is completed - retrieve tokens with PKCE validation
      const tokens = await proxyService.getTokens(sessionId, codeVerifier);

      if (!tokens) {
        return res.status(403).json({
          success: false,
          error: 'Invalid PKCE verifier or session expired',
        });
      }

      logger.info('OAuth proxy tokens retrieved', {
        sessionId: sessionId.substring(0, 8) + '...',
        email: tokens.email,
      });

      res.json({
        success: true,
        status: 'completed',
        tokens,
      });
    } catch (error) {
      logger.error('Failed to retrieve tokens', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tokens',
      });
    }
  });

  /**
   * POST /api/oauth/proxy/refresh
   *
   * Refresh an access token using the client secret.
   * External instances call this since they don't have the client secret.
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    // Check if proxy is enabled
    if (!isProxyEnabled()) {
      return res.status(403).json({ success: false, error: 'OAuth proxy is not enabled' });
    }

    // Rate limiting
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rateCheck = checkRateLimit('refresh', ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: rateCheck.retryAfter,
      });
    }

    await initPromise;

    if (!isConfigured || !oauth2Client || !credentials) {
      return res.status(503).json({
        success: false,
        error: 'OAuth proxy not configured',
      });
    }

    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing refreshToken',
      });
    }

    try {
      // Create a fresh OAuth client for the refresh
      const tempClient = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        getProxyCallbackUrl()
      );

      tempClient.setCredentials({ refresh_token: refreshToken });

      // Refresh the token
      const { credentials: newCreds } = await tempClient.refreshAccessToken();

      if (!newCreds.access_token) {
        throw new Error('Failed to refresh access token');
      }

      logger.info('OAuth proxy token refreshed');

      res.json({
        success: true,
        accessToken: newCreds.access_token,
        expiresAt: newCreds.expiry_date || Date.now() + 3600 * 1000,
      });
    } catch (error) {
      logger.error('Failed to refresh token', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to refresh token',
      });
    }
  });

  /**
   * GET /api/oauth/proxy/status
   *
   * Check if OAuth proxy is enabled and configured.
   */
  router.get('/status', async (_req: Request, res: Response) => {
    await initPromise;

    res.json({
      enabled: isProxyEnabled(),
      configured: isConfigured,
      callbackUrl: isConfigured ? getProxyCallbackUrl() : null,
    });
  });

  // Cleanup expired sessions periodically
  setInterval(
    () => {
      proxyService.cleanupExpired().catch((error) => {
        logger.error('Failed to cleanup expired sessions', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    },
    5 * 60 * 1000
  );

  return router;
}
