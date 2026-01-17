/**
 * MCP Server Routes
 *
 * API endpoints for MCP (Model Context Protocol) server management.
 * Migrated from src/dashboard/server.ts to support production Docker deployments.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import { createSecretsService } from '@orient/database-services';
import * as fs from 'fs';
import * as path from 'path';

// Lazy-loaded OAuth modules - using 'any' type because these are dynamically imported
// and TypeScript can't verify the module structure at compile time

// Google OAuth service from @orient/integrations/google
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let googleOAuthServiceModule: any = null;

// Atlassian OAuth service from @orient/mcp-servers/oauth
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let atlassianOAuthModule: any = null;

// GitHub OAuth service from @orient/integrations/catalog/github
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gitHubOAuthModule: any = null;

async function getGitHubOAuthModule() {
  // Always reload credentials from secrets database
  try {
    const secretsService = createSecretsService();
    const clientId = await secretsService.getSecret('GITHUB_CLIENT_ID');
    const clientSecret = await secretsService.getSecret('GITHUB_CLIENT_SECRET');

    if (clientId && clientSecret) {
      const credentialsChanged =
        process.env.GITHUB_CLIENT_ID !== clientId ||
        process.env.GITHUB_CLIENT_SECRET !== clientSecret;

      if (credentialsChanged) {
        process.env.GITHUB_CLIENT_ID = clientId;
        process.env.GITHUB_CLIENT_SECRET = clientSecret;
        logger.info('Loaded GitHub OAuth credentials from secrets database');
      }
    }
  } catch (error) {
    logger.debug('Could not load GitHub OAuth credentials from secrets', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!gitHubOAuthModule) {
    try {
      // Use package import - much cleaner than relative paths
      gitHubOAuthModule = await import('@orient/integrations/catalog/github');
    } catch (error) {
      throw new Error(
        `Failed to load GitHub OAuth service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return gitHubOAuthModule!;
}

async function getAtlassianOAuthModule() {
  if (!atlassianOAuthModule) {
    try {
      // Use package import - Atlassian OAuth is re-exported from @orient/mcp-servers
      atlassianOAuthModule = await import('@orient/mcp-servers/oauth');
      logger.info('Loaded Atlassian OAuth module');
    } catch (error) {
      throw new Error(
        `Failed to load Atlassian OAuth service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return atlassianOAuthModule;
}

async function getGoogleOAuthModule() {
  // Always reload credentials from secrets database to pick up new uploads
  try {
    const secretsService = createSecretsService();
    const clientId = await secretsService.getSecret('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = await secretsService.getSecret('GOOGLE_OAUTH_CLIENT_SECRET');

    // If credentials are in secrets, set them as env vars for the service to pick up
    if (clientId && clientSecret) {
      // Check if credentials have changed
      const credentialsChanged =
        process.env.GOOGLE_OAUTH_CLIENT_ID !== clientId ||
        process.env.GOOGLE_OAUTH_CLIENT_SECRET !== clientSecret;

      if (credentialsChanged) {
        process.env.GOOGLE_OAUTH_CLIENT_ID = clientId;
        process.env.GOOGLE_OAUTH_CLIENT_SECRET = clientSecret;
        logger.info('Loaded Google OAuth credentials from secrets database');
      }
    }
  } catch (error) {
    logger.debug('Could not load Google OAuth credentials from secrets', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!googleOAuthServiceModule) {
    try {
      // Dynamic import from packages/integrations
      googleOAuthServiceModule = await import('@orient/integrations/google');
    } catch (error) {
      throw new Error(
        `Failed to load Google OAuth service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return googleOAuthServiceModule;
}

const logger = createServiceLogger('mcp-routes');

/**
 * Get the project root directory
 * When running from packages/dashboard, we need to go up to the project root
 */
function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.includes('/packages/')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

/**
 * MCP Server Status Interface
 */
interface MCPServerStatus {
  name: string;
  type: 'local' | 'remote';
  url?: string;
  enabled: boolean;
  connected: boolean;
  hasTokens: boolean;
  toolCount?: number;
  lastConnected?: string;
}

/**
 * OAuth Callback Configuration
 */
interface OAuthCallbackConfig {
  redirectUrl: string;
  isProduction: boolean;
  callbackHost: string;
  callbackPort: number;
}

/**
 * Get OAuth callback configuration based on environment
 */
function getCallbackConfig(): OAuthCallbackConfig {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.IS_DOCKER === 'true';
  const callbackHost =
    process.env.OAUTH_CALLBACK_HOST ||
    (isProduction ? process.env.PRODUCTION_HOST || '127.0.0.1' : '127.0.0.1');
  const callbackPort = parseInt(process.env.OAUTH_CALLBACK_PORT || '8766', 10);

  const redirectUrl = isProduction
    ? `https://${callbackHost}/oauth/callback`
    : `http://${callbackHost}:${callbackPort}/oauth/callback`;

  return {
    redirectUrl,
    isProduction,
    callbackHost,
    callbackPort,
  };
}

/**
 * Get MCP servers status from configuration and token files
 */
async function getMCPServersStatus(): Promise<MCPServerStatus[]> {
  const servers: MCPServerStatus[] = [];

  // Read opencode.json config (local and Docker)
  const projectRoot = getProjectRoot();

  const possibleConfigPaths = [
    path.join(projectRoot, 'opencode.json'),
    path.join(projectRoot, 'opencode.local.json'),
    path.join(process.cwd(), 'opencode.json'),
    path.join(process.cwd(), 'opencode.local.json'),
    path.join('/home/opencode/.config/opencode/config.json'),
    path.join('/app/opencode.json'),
  ];

  let mcpConfig: Record<
    string,
    { type?: string; url?: string; command?: string[]; enabled?: boolean }
  > = {};

  for (const configPath of possibleConfigPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.mcp) {
          mcpConfig = { ...mcpConfig, ...config.mcp };
          logger.debug('Loaded MCP config', { configPath, servers: Object.keys(config.mcp) });
        }
      }
    } catch (error) {
      logger.debug('Failed to load config', { configPath, error: String(error) });
    }
  }

  // Read auth file to check authorization status
  const possibleAuthPaths = [
    path.join(projectRoot, 'data', 'oauth-tokens', 'mcp-auth.json'),
    path.join(process.cwd(), 'data', 'oauth-tokens', 'mcp-auth.json'),
    path.join('/app/data', 'oauth-tokens', 'mcp-auth.json'),
  ];

  let authData: Record<
    string,
    {
      tokens?: { accessToken?: string; expiresAt?: number };
      clientInfo?: { clientId?: string };
    }
  > = {};

  for (const authPath of possibleAuthPaths) {
    try {
      if (fs.existsSync(authPath)) {
        authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
        break;
      }
    } catch {
      // Continue to next auth file
    }
  }

  // Process each configured MCP server
  for (const [name, config] of Object.entries(mcpConfig)) {
    const isRemote = config.type === 'remote' || !!config.url;
    const serverUrl = config.url;

    // Check if has valid tokens
    let hasTokens = false;
    let lastConnected: string | undefined;

    const authEntry = authData[name];
    if (authEntry?.tokens?.accessToken) {
      hasTokens = true;
      const expiresAt = authEntry.tokens.expiresAt;
      if (expiresAt) {
        // Token exists, check if expired
        hasTokens = Date.now() / 1000 < expiresAt;
      }
    }

    servers.push({
      name,
      type: isRemote ? 'remote' : 'local',
      url: serverUrl,
      enabled: config.enabled !== false,
      connected: isRemote ? hasTokens : config.enabled !== false,
      hasTokens,
      lastConnected,
    });
  }

  // Always include Atlassian if not already there
  const hasAtlassian = servers.some((s) => s.name.toLowerCase().includes('atlassian'));
  if (!hasAtlassian) {
    const atlassianUrl = 'https://mcp.atlassian.com/v1/sse';
    const atlassianAuth = authData['atlassian'] || authData['Atlassian-MCP-Server'];
    const hasAtlassianTokens = !!atlassianAuth?.tokens?.accessToken;

    servers.push({
      name: 'atlassian',
      type: 'remote',
      url: atlassianUrl,
      enabled: false,
      connected: hasAtlassianTokens,
      hasTokens: hasAtlassianTokens,
    });
  }

  // Always include Google OAuth
  const hasGoogle = servers.some((s) => s.name.toLowerCase().includes('google'));
  if (!hasGoogle) {
    let hasGoogleTokens = false;
    let googleEmail: string | undefined;

    const possibleGooglePaths = [
      path.join(projectRoot, 'data', 'oauth-tokens', 'google-oauth.json'),
      path.join(process.cwd(), 'data', 'oauth-tokens', 'google-oauth.json'),
      path.join('/app/data', 'oauth-tokens', 'google-oauth.json'),
    ];

    for (const googlePath of possibleGooglePaths) {
      try {
        if (fs.existsSync(googlePath)) {
          const googleOAuthData = JSON.parse(fs.readFileSync(googlePath, 'utf-8'));
          if (googleOAuthData.accounts && Object.keys(googleOAuthData.accounts).length > 0) {
            hasGoogleTokens = true;
            googleEmail = Object.keys(googleOAuthData.accounts)[0];
            break;
          }
        }
      } catch {
        // No Google OAuth tokens
      }
    }

    servers.push({
      name: 'Google-OAuth',
      type: 'remote',
      url: googleEmail ? `Connected: ${googleEmail}` : 'Not connected',
      enabled: true,
      connected: hasGoogleTokens,
      hasTokens: hasGoogleTokens,
    });
  }

  return servers;
}

/**
 * Create MCP routes
 */
export function createMcpRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // Get MCP servers status
  router.get('/servers', requireAuth, async (_req: Request, res: Response) => {
    try {
      const servers = await getMCPServersStatus();
      res.json({ servers });
    } catch (error) {
      logger.error('Failed to get MCP servers status', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get MCP servers status' });
    }
  });

  // Get OAuth callback configuration
  router.get('/oauth/config', requireAuth, async (_req: Request, res: Response) => {
    try {
      const config = getCallbackConfig();
      res.json(config);
    } catch (error) {
      logger.error('Failed to get OAuth config', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get OAuth config' });
    }
  });

  // Trigger OAuth flow for a server
  // Note: In Docker production, OAuth flows are handled via the OpenCode container
  // This endpoint provides the necessary info for the frontend to initiate the flow
  router.post('/oauth/authorize/:serverName', requireAuth, async (req: Request, res: Response) => {
    const { serverName } = req.params;
    try {
      const callbackConfig = getCallbackConfig();

      // Handle Google OAuth (works in both production and local development)
      if (serverName.toLowerCase().includes('google')) {
        try {
          const oauthModule = await getGoogleOAuthModule();
          const googleOAuthService = oauthModule.getGoogleOAuthService();

          // Check if already connected
          const accounts = googleOAuthService.getConnectedAccounts();
          if (accounts.length > 0) {
            res.json({
              success: true,
              serverName,
              message: `Already connected as ${accounts[0].email}`,
              connected: true,
            });
            return;
          }

          // Start Google OAuth flow
          const { authUrl, state } = await googleOAuthService.startOAuthFlow(
            oauthModule.DEFAULT_SCOPES
          );

          // Ensure callback server is running (for local dev)
          if (!oauthModule.IS_GOOGLE_OAUTH_PRODUCTION) {
            await googleOAuthService.ensureCallbackServerRunning();
          }

          logger.info('Google OAuth authorization URL generated', {
            serverName,
            urlLength: authUrl.length,
          });

          res.json({
            success: true,
            serverName,
            authUrl: authUrl,
            callbackUrl: oauthModule.IS_GOOGLE_OAUTH_PRODUCTION
              ? process.env.GOOGLE_OAUTH_CALLBACK_URL
              : `http://127.0.0.1:8766/oauth/google/callback`,
            oauthState: state,
            instructions:
              'Open the authUrl in a browser to authorize Google access. Complete the authorization and the callback will be handled automatically.',
          });
          return;
        } catch (error) {
          logger.error('Failed to initiate Google OAuth', {
            error: error instanceof Error ? error.message : String(error),
          });
          res.status(500).json({
            error: `Failed to initiate Google OAuth: ${error instanceof Error ? error.message : String(error)}`,
          });
          return;
        }
      }

      // Handle Atlassian OAuth
      if (serverName.toLowerCase().includes('atlassian')) {
        try {
          const atlassianModule = await getAtlassianOAuthModule();

          // Suppress browser auto-open - we'll return the URL to the frontend
          atlassianModule.setSuppressBrowserOpen(true);

          // Ensure callback server is running (for local dev)
          if (!atlassianModule.IS_PRODUCTION_OAUTH) {
            await atlassianModule.ensureCallbackServerRunning();
          }

          // Create OAuth provider for Atlassian MCP
          const atlassianUrl = 'https://mcp.atlassian.com/v1/sse';
          const provider = atlassianModule.createOAuthProvider(atlassianUrl, 'atlassian');

          // Check if already has valid tokens
          const existingTokens = await provider.tokens();
          if (existingTokens?.access_token) {
            res.json({
              success: true,
              serverName,
              message: 'Already connected to Atlassian',
              connected: true,
            });
            return;
          }

          // The OAuth flow will be triggered when we try to connect to the MCP server.
          // For now, we'll provide instructions on how to initiate via OpenCode,
          // since the MCP SDK handles the OAuth challenge internally.
          //
          // In the future, we could implement a standalone OAuth flow here by:
          // 1. Fetching the authorization server metadata from Atlassian
          // 2. Performing dynamic client registration
          // 3. Generating the auth URL with PKCE
          // 4. Handling the callback
          //
          // For now, redirect to OpenCode which handles this seamlessly.
          const openCodeUrl = process.env.OPENCODE_URL || 'http://localhost:4099';

          res.json({
            success: true,
            serverName,
            message: 'Atlassian OAuth requires OpenCode to handle the MCP connection.',
            requiresOpenCode: true,
            openCodeUrl,
            instructions: `Open ${openCodeUrl} and use any JIRA tool to trigger authentication. The OAuth flow will start automatically.`,
            callbackUrl: atlassianModule.OAUTH_CALLBACK_URL,
          });
          return;
        } catch (error) {
          logger.error('Failed to initiate Atlassian OAuth', {
            error: error instanceof Error ? error.message : String(error),
          });
          res.status(500).json({
            error: `Failed to initiate Atlassian OAuth: ${error instanceof Error ? error.message : String(error)}`,
          });
          return;
        }
      }

      // Other MCP servers
      res.json({
        success: false,
        serverName,
        message: 'OAuth for this server is not yet implemented.',
      });
    } catch (error) {
      logger.error('Failed to initiate OAuth', {
        serverName,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: `Failed to initiate OAuth flow: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  // Complete OAuth flow
  // Note: In Docker production, callbacks are handled by the OpenCode container
  router.post('/oauth/complete/:serverName', requireAuth, async (req: Request, res: Response) => {
    const { serverName } = req.params;
    try {
      const callbackConfig = getCallbackConfig();

      if (callbackConfig.isProduction) {
        // In production, OAuth completion happens via callback URL
        // Check if tokens exist (meaning callback was successful)
        const servers = await getMCPServersStatus();
        const server = servers.find((s) => s.name.toLowerCase() === serverName.toLowerCase());

        if (server?.hasTokens) {
          res.json({
            success: true,
            status: 'connected',
            message: `Successfully connected to ${serverName}`,
          });
        } else {
          res.json({
            success: false,
            pending: true,
            message: 'Waiting for OAuth callback - complete authorization in the browser',
          });
        }
        return;
      }

      // In local development
      res.json({
        success: false,
        message: 'OAuth completion not available in this context.',
      });
    } catch (error) {
      logger.error('Failed to complete OAuth', {
        serverName,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: `Failed to complete OAuth flow: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  // Clear OAuth tokens for a server
  router.delete('/oauth/tokens/:serverName', requireAuth, async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;

      // Handle Google OAuth tokens
      if (serverName.toLowerCase().includes('google')) {
        const projectRoot = getProjectRoot();
        const possiblePaths = [
          path.join(projectRoot, 'data', 'oauth-tokens', 'google-oauth.json'),
          path.join(process.cwd(), 'data', 'oauth-tokens', 'google-oauth.json'),
          path.join('/app/data', 'oauth-tokens', 'google-oauth.json'),
        ];

        for (const googleAuthFile of possiblePaths) {
          if (fs.existsSync(googleAuthFile)) {
            const data = JSON.parse(fs.readFileSync(googleAuthFile, 'utf-8'));
            if (data.accounts) {
              data.accounts = {};
              data.defaultAccount = null;
              fs.writeFileSync(googleAuthFile, JSON.stringify(data, null, 2));
              res.json({ success: true, message: 'Cleared Google OAuth tokens' });
              return;
            }
          }
        }
        res.json({ success: true, message: 'No Google OAuth tokens found' });
        return;
      }

      // Handle MCP auth tokens
      const projectRoot = getProjectRoot();
      const possibleAuthPaths = [
        path.join(projectRoot, 'data', 'oauth-tokens', 'mcp-auth.json'),
        path.join(process.cwd(), 'data', 'oauth-tokens', 'mcp-auth.json'),
        path.join('/app/data', 'oauth-tokens', 'mcp-auth.json'),
      ];

      for (const authFile of possibleAuthPaths) {
        if (fs.existsSync(authFile)) {
          const data = JSON.parse(fs.readFileSync(authFile, 'utf-8'));

          if (data[serverName]) {
            delete data[serverName];
            fs.writeFileSync(authFile, JSON.stringify(data, null, 2));
            res.json({ success: true, message: `Cleared tokens for ${serverName}` });
            return;
          }
        }
      }

      res.json({ success: true, message: 'No tokens found for this server' });
    } catch (error) {
      logger.error('Failed to clear OAuth tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to clear OAuth tokens' });
    }
  });

  // Get OpenCode server URL
  router.get('/opencode/url', requireAuth, async (_req: Request, res: Response) => {
    try {
      // In production (Docker), OpenCode is accessed via nginx or direct port
      // Check environment variables for the URL
      const openCodeUrl = process.env.OPENCODE_URL || process.env.OPENCODE_SERVER_URL;
      const openCodePort = process.env.OPENCODE_PORT || '4099';

      // Determine the URL based on environment
      let url: string | null = null;
      let available = false;

      if (openCodeUrl) {
        // Production: use configured URL
        url = openCodeUrl;
        available = true;
      } else {
        // Development: use localhost with port
        url = `http://localhost:${openCodePort}`;
        available = true;
      }

      res.json({
        url,
        available,
        port: openCodePort,
        isProduction: process.env.NODE_ENV === 'production' || process.env.IS_DOCKER === 'true',
      });
    } catch (error) {
      logger.error('Failed to get OpenCode URL', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get OpenCode URL' });
    }
  });

  // Atlassian OAuth callback handler (for local development)
  // This route handles the OAuth callback from Atlassian
  router.get('/oauth/atlassian/callback', async (req: Request, res: Response) => {
    try {
      const atlassianModule = await getAtlassianOAuthModule();

      // Extract query parameters
      const getQueryString = (value: unknown): string | null => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
        return null;
      };

      const code = getQueryString(req.query.code);
      const state = getQueryString(req.query.state);
      const error = getQueryString(req.query.error);
      const errorDescription = getQueryString(req.query.error_description);

      const result = atlassianModule.handleProductionOAuthCallback(
        code,
        state,
        error,
        errorDescription
      );

      if (result.success) {
        // Sync tokens to OpenCode so it can use them
        atlassianModule.syncMcpTokensToOpenCode();
        res.status(200).send(result.html);
      } else {
        res.status(400).send(result.html);
      }
    } catch (error) {
      logger.error('Atlassian OAuth callback error', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send('Internal server error during OAuth callback');
    }
  });

  // GitHub OAuth callback handler (for production mode)
  // This route handles the OAuth callback from GitHub
  router.get('/oauth/github/callback', async (req: Request, res: Response) => {
    try {
      const oauthModule = await getGitHubOAuthModule();

      // Extract query parameters
      const getQueryString = (value: unknown): string | null => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
        return null;
      };

      const code = getQueryString(req.query.code);
      const state = getQueryString(req.query.state);
      const error = getQueryString(req.query.error);
      const errorDescription = getQueryString(req.query.error_description);

      const result = await oauthModule.handleGitHubOAuthCallback(
        code,
        state,
        error,
        errorDescription
      );

      if (result.success) {
        logger.info('GitHub OAuth successful', { login: result.login });
        res.status(200).send(result.html);
      } else {
        logger.warn('GitHub OAuth failed', { error: result.error });
        res.status(400).send(result.html);
      }
    } catch (error) {
      logger.error('GitHub OAuth callback error', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send('Internal server error during OAuth callback');
    }
  });

  logger.info('MCP routes initialized');

  return router;
}
