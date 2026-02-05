/**
 * Google OAuth Authentication Routes
 *
 * Handles Google OAuth flow for dashboard authentication.
 * Now uses full integration scopes to also set up Google services (Calendar, Gmail, etc.)
 * when signing in with Google.
 */

import { Router, Request, Response } from 'express';
import { getParam } from './paramUtils.js';
import { google, Auth } from 'googleapis';
import { CodeChallengeMethod } from 'google-auth-library';
import crypto from 'crypto';
import { DashboardAuth } from '../../auth.js';
import type { MessageDatabase } from '@orient-bot/database-services';
import { createServiceLogger } from '@orient-bot/core';
import { createSecretsService } from '@orient-bot/database-services';
import {
  getGoogleOAuthService,
  DEFAULT_SCOPES,
  GoogleOAuthProxyClient,
  isProxyModeEnabled,
} from '@orient-bot/integrations';

const logger = createServiceLogger('google-auth-routes');

// Proxy client for external instances
let proxyClient: GoogleOAuthProxyClient | null = null;

/**
 * Get or create proxy client if proxy mode is enabled
 */
function getProxyClient(): GoogleOAuthProxyClient | null {
  if (!isProxyModeEnabled()) {
    return null;
  }
  if (!proxyClient) {
    try {
      proxyClient = new GoogleOAuthProxyClient();
    } catch (error) {
      logger.error('Failed to create proxy client', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
  return proxyClient;
}

// Use full integration scopes - signing in with Google also sets up the integration
const AUTH_SCOPES = DEFAULT_SCOPES;

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface PendingOAuthState {
  codeVerifier: string;
  createdAt: number;
}

// In-memory storage for pending OAuth states (CSRF protection)
const pendingStates = new Map<string, PendingOAuthState>();

// Cleanup expired states every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [state, data] of pendingStates.entries()) {
      if (now - data.createdAt > CALLBACK_TIMEOUT_MS) {
        pendingStates.delete(state);
      }
    }
  },
  5 * 60 * 1000
);

/**
 * Generate PKCE code verifier
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Get Google OAuth callback URL
 * Auto-detects environment (local, staging, production)
 */
function getCallbackUrl(): string {
  // Explicit override from environment
  if (process.env.GOOGLE_OAUTH_CALLBACK_URL) {
    return process.env.GOOGLE_OAUTH_CALLBACK_URL;
  }

  // Auto-detect environment
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const appDomain = process.env.ORIENT_APP_DOMAIN;

  // Production: Use HTTPS with app domain
  if (isProduction && appDomain) {
    return `https://${appDomain}/api/auth/google/callback`;
  }

  // Staging: Use HTTPS with staging domain (if exists)
  if (nodeEnv === 'staging' && appDomain) {
    return `https://staging.${appDomain}/api/auth/google/callback`;
  }

  // Local/Development: Use localhost with dashboard port
  const port = process.env.DASHBOARD_PORT || '4098';
  return `http://localhost:${port}/api/auth/google/callback`;
}

/**
 * Get Google OAuth credentials from secrets database or environment
 */
async function getGoogleCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const secrets = createSecretsService();

  try {
    // Try secrets database first
    let clientId = await secrets.getSecret('GOOGLE_OAUTH_CLIENT_ID');
    let clientSecret = await secrets.getSecret('GOOGLE_OAUTH_CLIENT_SECRET');

    // Fallback to environment variables
    if (!clientId) clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || null;
    if (!clientSecret) clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || null;

    if (clientId && clientSecret) {
      logger.debug('Google OAuth credentials loaded', {
        source: clientId === process.env.GOOGLE_OAUTH_CLIENT_ID ? 'environment' : 'secrets-db',
      });
      return { clientId, clientSecret };
    }

    return null;
  } catch (error) {
    logger.error('Failed to load Google OAuth credentials from secrets database', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback to environment variables
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (clientId && clientSecret) {
      logger.warn('Using Google OAuth credentials from environment variables (fallback)');
      return { clientId, clientSecret };
    }

    return null;
  }
}

/**
 * Create Google OAuth routes
 */
export function createGoogleAuthRoutes(auth: DashboardAuth, db: MessageDatabase): Router {
  const router = Router();

  let oauth2Client: Auth.OAuth2Client | null = null;
  let isConfigured = false;

  // Initialize OAuth client asynchronously
  const initPromise = getGoogleCredentials().then((credentials) => {
    if (!credentials) {
      logger.warn(
        'Google OAuth not configured - routes disabled. Store credentials in secrets database or set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET'
      );
      return;
    }

    const callbackUrl = getCallbackUrl();
    oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      callbackUrl
    );
    isConfigured = true;

    const nodeEnv = process.env.NODE_ENV || 'development';
    logger.info('Google OAuth routes initialized', {
      environment: nodeEnv,
      callbackUrl,
      isLocal: callbackUrl.includes('localhost'),
    });
  });

  /**
   * POST /auth/google/start
   *
   * Initiate Google OAuth flow.
   * Returns the authorization URL for the frontend to redirect to.
   *
   * Supports two modes:
   * 1. Direct mode: Local credentials configured (GOOGLE_OAUTH_CLIENT_ID/SECRET)
   * 2. Proxy mode: Use production's OAuth client via GOOGLE_OAUTH_PROXY_URL
   */
  router.post('/start', async (req: Request, res: Response) => {
    // Wait for initialization
    await initPromise;

    // Try proxy mode if local credentials aren't configured
    if (!isConfigured || !oauth2Client) {
      const proxy = getProxyClient();
      if (proxy) {
        try {
          logger.info('Using OAuth proxy mode');
          const result = await proxy.startOAuthFlow(AUTH_SCOPES);
          res.json({
            authUrl: result.authUrl,
            state: result.state,
            proxyMode: true,
            sessionId: result.sessionId,
          });
          return;
        } catch (error) {
          logger.error('Proxy OAuth flow failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          res.status(503).json({
            error: 'Google OAuth proxy unavailable',
            message:
              'Google sign-in is temporarily unavailable. Please create an account using username and password instead.',
          });
          return;
        }
      }

      res.status(503).json({
        error: 'Google OAuth not configured',
        message:
          'Google sign-in is not available. Please create an account using username and password instead.',
      });
      return;
    }

    try {
      // Generate PKCE code verifier and challenge
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Generate state for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');

      // Store pending auth state
      pendingStates.set(state, {
        codeVerifier,
        createdAt: Date.now(),
      });

      // Generate authorization URL
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: AUTH_SCOPES,
        state,
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: codeChallenge,
        prompt: 'consent', // Always prompt for consent
      });

      logger.info('OAuth flow started (direct mode)', {
        state: state.substring(0, 8) + '...',
      });

      res.json({ authUrl, state });
    } catch (error) {
      logger.error('Failed to start OAuth flow', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to start Google OAuth flow',
      });
    }
  });

  /**
   * POST /auth/google/poll
   *
   * Poll for tokens in proxy mode.
   * Frontend calls this after user completes OAuth consent in popup.
   */
  router.post('/poll', async (req: Request, res: Response) => {
    const { sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }

    const proxy = getProxyClient();
    if (!proxy) {
      res.status(503).json({
        error: 'Proxy mode not enabled',
        message: 'This endpoint is only available in proxy mode',
      });
      return;
    }

    try {
      const tokens = await proxy.pollForTokens(sessionId);

      // Create or login user with Google
      let loginResult = await auth.loginWithGoogle(tokens.email, tokens.email);

      if (!loginResult) {
        logger.info('Creating new user from proxy OAuth', { email: tokens.email });
        await auth.createUserWithGoogle(tokens.email, tokens.email);
        loginResult = await auth.loginWithGoogle(tokens.email, tokens.email);

        if (!loginResult) {
          throw new Error('Failed to login after creating user');
        }
      }

      // Store OAuth tokens for Google integration
      if (tokens.refreshToken) {
        try {
          const oauthService = getGoogleOAuthService();
          oauthService.addAccountFromTokens({
            email: tokens.email,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            scopes: tokens.scopes,
          });
          logger.info('Google integration tokens stored from proxy', { email: tokens.email });
        } catch (integrationError) {
          logger.warn('Failed to store Google integration tokens from proxy', {
            error:
              integrationError instanceof Error
                ? integrationError.message
                : String(integrationError),
          });
        }
      }

      logger.info('User authenticated via proxy OAuth', { username: loginResult.username });

      res.json({
        success: true,
        token: loginResult.token,
        username: loginResult.username,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Check if still pending (not completed yet)
      if (message.includes('pending') || message.includes('not completed')) {
        res.json({
          success: false,
          status: 'pending',
          message: 'Waiting for user to complete OAuth flow',
        });
        return;
      }

      logger.error('Proxy poll failed', { error: message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tokens from proxy',
        message,
      });
    }
  });

  /**
   * GET /auth/google/callback
   *
   * Handle Google OAuth callback.
   * Exchange authorization code for tokens, create/login user, and redirect to dashboard.
   */
  router.get('/callback', async (req: Request, res: Response) => {
    // Wait for initialization
    await initPromise;

    if (!isConfigured || !oauth2Client) {
      res.status(503).send('Google OAuth not configured');
      return;
    }

    const { code, state, error, error_description } = req.query;

    // Handle OAuth error
    if (error) {
      const errorMsg = (error_description as string) || (error as string);
      logger.warn('OAuth callback received error', { error: errorMsg });
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sign-in Failed</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 2rem; background: white; border-radius: 0.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #dc2626; margin-bottom: 1rem; }
            p { color: #666; margin-bottom: 1.5rem; }
            a { color: #2563eb; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Sign-in Failed</h1>
            <p>${errorMsg}</p>
            <a href="/">Return to Dashboard</a>
          </div>
        </body>
        </html>
      `);
      return;
    }

    // Validate state
    if (!state || typeof state !== 'string') {
      logger.warn('OAuth callback missing state parameter');
      res.status(400).send('Missing state parameter');
      return;
    }

    const pendingState = pendingStates.get(state);
    if (!pendingState) {
      logger.warn('OAuth callback with invalid or expired state', { state });
      res.status(400).send('Invalid or expired OAuth state');
      return;
    }

    // Check if state is expired
    if (Date.now() - pendingState.createdAt > CALLBACK_TIMEOUT_MS) {
      pendingStates.delete(state);
      logger.warn('OAuth state expired', { state });
      res.status(400).send('OAuth state expired - please try again');
      return;
    }

    // Validate code
    if (!code || typeof code !== 'string') {
      logger.warn('OAuth callback missing code parameter');
      res.status(400).send('No authorization code provided');
      return;
    }

    try {
      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken({
        code,
        codeVerifier: pendingState.codeVerifier,
      });

      if (!tokens.access_token) {
        throw new Error('Failed to get access token from Google');
      }

      // Set credentials to get user info
      oauth2Client.setCredentials(tokens);

      // Get user profile
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      const email = userInfo.data.email;
      const googleId = userInfo.data.id;

      if (!email || !googleId) {
        throw new Error('Could not get email or ID from Google profile');
      }

      // Try to login with Google
      let loginResult = await auth.loginWithGoogle(googleId, email);

      // If no user found, create new user
      if (!loginResult) {
        logger.info('Creating new user with Google OAuth', { email });
        await auth.createUserWithGoogle(googleId, email);
        loginResult = await auth.loginWithGoogle(googleId, email);

        if (!loginResult) {
          throw new Error('Failed to login after creating user');
        }
      }

      // Store OAuth tokens for Google integration (Calendar, Gmail, etc.)
      // This allows the user to use Google services immediately after sign-in
      if (tokens.refresh_token) {
        try {
          const oauthService = getGoogleOAuthService();
          oauthService.addAccountFromTokens({
            email,
            displayName: userInfo.data.name || undefined,
            accessToken: tokens.access_token!,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiry_date || Date.now() + 3600 * 1000,
            scopes: AUTH_SCOPES,
          });
          logger.info('Google integration tokens stored after sign-in', { email });
        } catch (integrationError) {
          // Don't fail sign-in if token storage fails
          logger.warn('Failed to store Google integration tokens', {
            error:
              integrationError instanceof Error
                ? integrationError.message
                : String(integrationError),
          });
        }
      } else {
        logger.warn('No refresh token received - user may need to reconnect for full integration', {
          email,
        });
      }

      // Clean up pending state
      pendingStates.delete(state);

      // Set token in cookie and redirect to dashboard
      // Note: httpOnly must be false so frontend JavaScript can read the token
      res.cookie('auth_token', loginResult.token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      logger.info('User authenticated with Google', { username: loginResult.username });

      // Send inline HTML that uses postMessage to notify the opener window,
      // then closes the popup. This is more reliable than URL-based detection
      // which can fail due to SPA routing or cross-origin restrictions.
      res.send(`<!DOCTYPE html>
<html>
<head><title>Sign-in Successful</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({
      type: 'GOOGLE_AUTH_SUCCESS',
      token: ${JSON.stringify(loginResult.token)},
      username: ${JSON.stringify(loginResult.username)}
    }, window.location.origin);
    window.close();
  } else {
    // Fallback: if no opener (e.g. popup blocker), redirect to dashboard
    window.location.href = '/';
  }
</script>
<noscript><a href="/">Return to Dashboard</a></noscript>
</body>
</html>`);
    } catch (error) {
      // Clean up pending state on error
      pendingStates.delete(state);

      logger.error('OAuth callback failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sign-in Failed</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 2rem; background: white; border-radius: 0.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #dc2626; margin-bottom: 1rem; }
            p { color: #666; margin-bottom: 1.5rem; }
            a { color: #2563eb; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Sign-in Failed</h1>
            <p>An error occurred during authentication. Please try again.</p>
            <a href="/">Return to Dashboard</a>
          </div>
        </body>
        </html>
      `);
    }
  });

  return router;
}
