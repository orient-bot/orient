/**
 * Integrations Routes
 *
 * API endpoints for the Integration Catalog.
 * Provides a unified view of all integrations with OAuth connection support.
 */

import { Router, Request, Response } from 'express';
import { getParam } from './paramUtils.js';
import { createServiceLogger } from '@orient-bot/core';
import { createSecretsService } from '@orient-bot/database-services';
import type { IntegrationManifest } from '@orient-bot/integrations/types';

const logger = createServiceLogger('integrations-routes');

// Lazy-loaded manifest loader module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loaderModule: any = null;

async function getLoaderModule(): Promise<{
  loadIntegrationManifests: () => Promise<IntegrationManifest[]>;
  loadIntegrationManifest: (name: string) => Promise<IntegrationManifest | null>;
}> {
  if (!loaderModule) {
    loaderModule = await import('@orient-bot/integrations/catalog/loader');
  }
  return loaderModule;
}

// Lazy-loaded OAuth modules - using 'any' type because these are dynamically imported
// and TypeScript can't verify the module structure at compile time

// Google OAuth service from @orient-bot/integrations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let googleOAuthServiceModule: any = null;

// Atlassian OAuth service from @orient-bot/mcp-servers/oauth
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let atlassianOAuthModule: any = null;

// GitHub OAuth service from @orient-bot/integrations/catalog/github
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gitHubOAuthModule: any = null;

async function getGoogleOAuthModule() {
  // Always reload credentials from secrets database
  try {
    const secretsService = createSecretsService();
    const clientId = await secretsService.getSecret('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = await secretsService.getSecret('GOOGLE_OAUTH_CLIENT_SECRET');

    if (clientId && clientSecret) {
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
      googleOAuthServiceModule = await import('@orient-bot/integrations');
    } catch (error) {
      throw new Error(
        `Failed to load Google OAuth service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return googleOAuthServiceModule;
}

async function getAtlassianOAuthModule() {
  if (!atlassianOAuthModule) {
    try {
      // Use package import - Atlassian OAuth is re-exported from @orient-bot/mcp-servers
      atlassianOAuthModule = await import('@orient-bot/mcp-servers/oauth');
      logger.info('Loaded Atlassian OAuth module');
    } catch (error) {
      throw new Error(
        `Failed to load Atlassian OAuth service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return atlassianOAuthModule;
}

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
      gitHubOAuthModule = await import('@orient-bot/integrations/catalog/github');
    } catch (error) {
      throw new Error(
        `Failed to load GitHub OAuth service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return gitHubOAuthModule;
}

// Linear OAuth service lazy-loaded
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let linearOAuthModule: any = null;

async function getLinearOAuthModule() {
  // Always reload credentials from secrets database
  try {
    const secretsService = createSecretsService();
    const clientId = await secretsService.getSecret('LINEAR_CLIENT_ID');
    const clientSecret = await secretsService.getSecret('LINEAR_CLIENT_SECRET');

    if (clientId && clientSecret) {
      const credentialsChanged =
        process.env.LINEAR_CLIENT_ID !== clientId ||
        process.env.LINEAR_CLIENT_SECRET !== clientSecret;

      if (credentialsChanged) {
        process.env.LINEAR_CLIENT_ID = clientId;
        process.env.LINEAR_CLIENT_SECRET = clientSecret;
        logger.info('Loaded Linear OAuth credentials from secrets database');
      }
    }
  } catch (error) {
    logger.debug('Could not load Linear OAuth credentials from secrets', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!linearOAuthModule) {
    try {
      linearOAuthModule = await import('@orient-bot/integrations/catalog/linear');
    } catch (error) {
      throw new Error(
        `Failed to load Linear OAuth service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return linearOAuthModule;
}

/**
 * Build catalog entries from YAML manifests and legacy entries
 */
async function buildCatalogEntries(): Promise<
  Array<{
    manifest: IntegrationManifest;
    secretsConfigured: boolean;
    isConnected: boolean;
  }>
> {
  const secretsService = createSecretsService();
  const entries: Array<{
    manifest: IntegrationManifest;
    secretsConfigured: boolean;
    isConnected: boolean;
  }> = [];

  // Load manifests from YAML files
  const loader = await getLoaderModule();
  const manifests = await loader.loadIntegrationManifests();

  for (const manifest of manifests) {
    // Check if required secrets are configured
    let secretsConfigured = true;
    const requiredSecrets = manifest.requiredSecrets.filter((s) => s.required !== false);

    // For integrations with authMethods, check based on selected auth method
    // For now, check if ANY auth method has all its secrets configured
    if (manifest.authMethods && manifest.authMethods.length > 0) {
      // Check each auth method to see if any is fully configured
      let anyMethodConfigured = false;
      for (const method of manifest.authMethods) {
        let methodConfigured = true;
        for (const field of method.requiredFields) {
          const secret = await secretsService.getSecret(field);
          if (!secret) {
            methodConfigured = false;
            break;
          }
        }
        if (methodConfigured) {
          anyMethodConfigured = true;
          break;
        }
      }
      secretsConfigured = anyMethodConfigured;
    } else {
      // Standard check for integrations without multiple auth methods
      for (const secret of requiredSecrets) {
        const value = await secretsService.getSecret(secret.name);
        if (!value) {
          secretsConfigured = false;
          break;
        }
      }
    }

    entries.push({
      manifest,
      secretsConfigured,
      isConnected: false, // Will be updated with actual connection status
    });
  }

  // Add legacy Atlassian entry (uses MCP OAuth, not YAML-based)
  entries.push({
    manifest: {
      name: 'atlassian',
      title: 'Atlassian (JIRA & Confluence)',
      description:
        'Access JIRA for issue tracking and project management, and Confluence for documentation and collaboration.',
      version: '1.0.0',
      author: 'Orient',
      status: 'stable',
      docsUrl: 'https://developer.atlassian.com/',
      oauth: {
        type: 'oauth2',
        authorizationUrl: 'https://auth.atlassian.com/authorize',
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        scopes: [
          'read:jira-work',
          'write:jira-work',
          'read:confluence-content.all',
          'write:confluence-content',
        ],
      },
      tools: [
        { name: 'jira.issues.list', description: 'List JIRA issues', category: 'jira' },
        { name: 'jira.issues.create', description: 'Create JIRA issues', category: 'jira' },
        { name: 'jira.issues.update', description: 'Update JIRA issues', category: 'jira' },
        { name: 'jira.projects.list', description: 'List JIRA projects', category: 'jira' },
        {
          name: 'confluence.pages.list',
          description: 'List Confluence pages',
          category: 'confluence',
        },
        {
          name: 'confluence.pages.create',
          description: 'Create Confluence pages',
          category: 'confluence',
        },
      ],
      requiredSecrets: [],
    },
    secretsConfigured: true, // Atlassian uses MCP OAuth, no manual secrets needed
    isConnected: false,
  });

  return entries;
}

/**
 * Create integrations routes
 */
export function createIntegrationsRoutes(
  requireAuth: (req: Request, res: Response, next: () => void) => void
): Router {
  const router = Router();

  // Get active integrations (connected integrations)
  router.get('/active', requireAuth, async (_req: Request, res: Response) => {
    try {
      const activeIntegrations: string[] = [];

      // Check Google
      try {
        const oauthModule = await getGoogleOAuthModule();
        const googleOAuthService = oauthModule.getGoogleOAuthService();
        const accounts = googleOAuthService.getConnectedAccounts();
        if (accounts.length > 0) {
          activeIntegrations.push('google');
        }
      } catch {
        // Google not available
      }

      // Check Atlassian
      try {
        const atlassianModule = await getAtlassianOAuthModule();
        const atlassianUrl = 'https://mcp.atlassian.com/v1/sse';
        const provider = atlassianModule.createOAuthProvider(atlassianUrl, 'atlassian');
        const tokens = await provider.tokens();
        if (tokens?.access_token) {
          activeIntegrations.push('atlassian');
        }
      } catch {
        // Atlassian not available
      }

      // Check GitHub
      try {
        const oauthModule = await getGitHubOAuthModule();
        const gitHubOAuthService = oauthModule.getGitHubOAuthService();
        const accounts = gitHubOAuthService.getConnectedAccounts();
        if (accounts.length > 0) {
          activeIntegrations.push('github');
        }
      } catch {
        // GitHub not available
      }

      res.json({ integrations: activeIntegrations });
    } catch (error) {
      logger.error('Failed to get active integrations', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get active integrations' });
    }
  });

  // Get available capabilities (for mini-apps)
  router.get('/capabilities', requireAuth, async (_req: Request, res: Response) => {
    try {
      const availableCapabilities: string[] = [];

      // Storage is always available (uses SQLite)
      availableCapabilities.push('storage');

      // Check if scheduler service is available
      try {
        // Scheduler service is always available in production
        availableCapabilities.push('scheduler');
      } catch {
        // Scheduler not available
      }

      // Check if webhooks service is available
      try {
        // Webhooks service is always available in production
        availableCapabilities.push('webhooks');
      } catch {
        // Webhooks not available
      }

      res.json({ capabilities: availableCapabilities });
    } catch (error) {
      logger.error('Failed to get available capabilities', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get available capabilities' });
    }
  });

  // Get integration catalog
  router.get('/catalog', requireAuth, async (_req: Request, res: Response) => {
    try {
      // Build catalog from YAML manifests
      const catalogEntries = await buildCatalogEntries();

      // Build catalog with actual connection status
      const catalog = await Promise.all(
        catalogEntries.map(async (integration) => {
          const result = { ...integration };

          // Check Google connection status
          if (integration.manifest.name === 'google') {
            try {
              const oauthModule = await getGoogleOAuthModule();
              const googleOAuthService = oauthModule.getGoogleOAuthService();
              const accounts = googleOAuthService.getConnectedAccounts();
              result.isConnected = accounts.length > 0;
            } catch {
              // OAuth module not available, leave as disconnected
            }
          }

          // Check Atlassian connection status
          if (integration.manifest.name === 'atlassian') {
            try {
              const atlassianModule = await getAtlassianOAuthModule();
              const atlassianUrl = 'https://mcp.atlassian.com/v1/sse';
              const provider = atlassianModule.createOAuthProvider(atlassianUrl, 'atlassian');
              const tokens = await provider.tokens();
              result.isConnected = !!tokens?.access_token;
            } catch {
              // OAuth module not available, leave as disconnected
            }
          }

          // Check GitHub connection status
          if (integration.manifest.name === 'github') {
            try {
              const oauthModule = await getGitHubOAuthModule();
              const gitHubOAuthService = oauthModule.getGitHubOAuthService();
              const accounts = gitHubOAuthService.getConnectedAccounts();
              result.isConnected = accounts.length > 0;
            } catch {
              // OAuth module not available, leave as disconnected
            }
          }

          // Check Linear connection status
          if (integration.manifest.name === 'linear') {
            try {
              const oauthModule = await getLinearOAuthModule();
              if (oauthModule.getLinearOAuthService) {
                const linearOAuthService = oauthModule.getLinearOAuthService();
                const accounts = linearOAuthService.getConnectedAccounts();
                result.isConnected = accounts.length > 0;
              }
            } catch {
              // OAuth module not available, leave as disconnected
            }
          }

          return result;
        })
      );

      res.json(catalog);
    } catch (error) {
      logger.error('Failed to get integration catalog', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get integration catalog' });
    }
  });

  // Get a specific integration
  router.get('/catalog/:name', requireAuth, async (req: Request, res: Response) => {
    try {
      const name = getParam(req.params.name);
      const catalogEntries = await buildCatalogEntries();
      const integration = catalogEntries.find((i) => i.manifest.name === name);

      if (!integration) {
        return res.status(404).json({ error: `Integration '${name}' not found` });
      }

      res.json(integration);
    } catch (error) {
      logger.error('Failed to get integration', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get integration' });
    }
  });

  // Save credentials for an integration (inline credential entry)
  router.post('/connect/:name/credentials', requireAuth, async (req: Request, res: Response) => {
    try {
      const name = getParam(req.params.name);
      const { credentials, authMethod } = req.body as {
        credentials: Record<string, string>;
        authMethod?: string;
      };

      if (!credentials || typeof credentials !== 'object') {
        return res.status(400).json({ error: 'credentials object is required' });
      }

      const secretsService = createSecretsService();

      // Save each credential as a secret
      for (const [key, value] of Object.entries(credentials)) {
        if (value && typeof value === 'string') {
          await secretsService.setSecret(key, value, {
            category: 'oauth',
            description: `${name} OAuth credential`,
          });
          // Also set in environment for immediate use
          process.env[key] = value;
        }
      }

      logger.info('Saved integration credentials', {
        name,
        authMethod,
        credentialCount: Object.keys(credentials).length,
      });

      res.json({
        success: true,
        secretsConfigured: true,
        message: `Credentials saved for ${name}`,
      });
    } catch (error) {
      logger.error('Failed to save integration credentials', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to save credentials' });
    }
  });

  // Initiate OAuth connection for an integration
  router.post('/connect/:name', requireAuth, async (req: Request, res: Response) => {
    try {
      const name = getParam(req.params.name);
      const { authMethod } = req.body as { authMethod?: string };
      const catalogEntries = await buildCatalogEntries();
      const integration = catalogEntries.find((i) => i.manifest.name === name);

      if (!integration) {
        return res.status(404).json({ error: `Integration '${name}' not found` });
      }

      // Handle Google OAuth
      if (name === 'google') {
        try {
          const oauthModule = await getGoogleOAuthModule();
          const googleOAuthService = oauthModule.getGoogleOAuthService();

          // Check if already connected
          const accounts = googleOAuthService.getConnectedAccounts();
          if (accounts.length > 0) {
            return res.json({
              success: true,
              name,
              message: `Already connected as ${accounts[0].email}`,
              connected: true,
            });
          }

          // Start Google OAuth flow
          const { authUrl, state } = await googleOAuthService.startOAuthFlow(
            oauthModule.DEFAULT_SCOPES
          );

          // Ensure callback server is running (for local dev)
          if (!oauthModule.IS_GOOGLE_OAUTH_PRODUCTION) {
            await googleOAuthService.ensureCallbackServerRunning();
          }

          logger.info('Google OAuth authorization URL generated', { name });

          return res.json({
            success: true,
            name,
            authUrl,
            callbackUrl: oauthModule.IS_GOOGLE_OAUTH_PRODUCTION
              ? process.env.GOOGLE_OAUTH_CALLBACK_URL
              : 'http://127.0.0.1:8766/oauth/google/callback',
            oauthState: state,
            instructions: 'Complete authorization in the popup window.',
          });
        } catch (error) {
          logger.error('Failed to initiate Google OAuth', {
            error: error instanceof Error ? error.message : String(error),
          });
          return res.status(500).json({
            error: `Failed to initiate Google OAuth: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      // Handle Atlassian OAuth
      if (name === 'atlassian') {
        try {
          const atlassianModule = await getAtlassianOAuthModule();

          // Suppress browser auto-open
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
            return res.json({
              success: true,
              name,
              message: 'Already connected to Atlassian',
              connected: true,
            });
          }

          // Atlassian OAuth requires OpenCode to handle the MCP connection
          const openCodeUrl = process.env.OPENCODE_URL || 'http://localhost:4099';

          return res.json({
            success: true,
            name,
            message: 'Atlassian OAuth requires OpenCode to handle the MCP connection.',
            requiresOpenCode: true,
            openCodeUrl,
            instructions: `Open ${openCodeUrl} and use any Atlassian MCP tool to trigger authentication.`,
            callbackUrl: atlassianModule.OAUTH_CALLBACK_URL,
          });
        } catch (error) {
          logger.error('Failed to initiate Atlassian OAuth', {
            error: error instanceof Error ? error.message : String(error),
          });
          return res.status(500).json({
            error: `Failed to initiate Atlassian OAuth: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      // Handle GitHub OAuth
      if (name === 'github') {
        try {
          const oauthModule = await getGitHubOAuthModule();
          const gitHubOAuthService = oauthModule.getGitHubOAuthService();

          // Check if already connected
          const accounts = gitHubOAuthService.getConnectedAccounts();
          if (accounts.length > 0) {
            return res.json({
              success: true,
              name,
              message: `Already connected as @${accounts[0].login}`,
              connected: true,
            });
          }

          // Start GitHub OAuth flow
          const { authUrl, state } = await gitHubOAuthService.startOAuthFlow(
            oauthModule.DEFAULT_GITHUB_SCOPES
          );

          // Ensure callback server is running (for local dev)
          if (!oauthModule.IS_GITHUB_OAUTH_PRODUCTION) {
            await gitHubOAuthService.ensureCallbackServerRunning();
          }

          logger.info('GitHub OAuth authorization URL generated', { name });

          return res.json({
            success: true,
            name,
            authUrl,
            callbackUrl: oauthModule.IS_GITHUB_OAUTH_PRODUCTION
              ? process.env.GITHUB_OAUTH_CALLBACK_URL
              : gitHubOAuthService.getCallbackUrl(),
            oauthState: state,
            instructions: 'Complete authorization in the popup window.',
          });
        } catch (error) {
          logger.error('Failed to initiate GitHub OAuth', {
            error: error instanceof Error ? error.message : String(error),
          });
          return res.status(500).json({
            error: `Failed to initiate GitHub OAuth: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      // Handle Linear OAuth
      if (name === 'linear') {
        try {
          const linearModule = await getLinearOAuthModule();

          // Check if OAuth service is available
          if (!linearModule.getLinearOAuthService) {
            return res.status(500).json({
              error: 'Linear OAuth service not available. Create the OAuth service first.',
            });
          }

          const linearOAuthService = linearModule.getLinearOAuthService();

          // Check if already connected
          const accounts = linearOAuthService.getConnectedAccounts();
          if (accounts.length > 0) {
            return res.json({
              success: true,
              name,
              message: `Already connected as ${accounts[0].displayName || accounts[0].email}`,
              connected: true,
            });
          }

          // Start Linear OAuth flow
          const { authUrl, state } = await linearOAuthService.startOAuthFlow();

          // Ensure callback server is running (for local dev)
          if (!linearModule.IS_LINEAR_OAUTH_PRODUCTION) {
            await linearOAuthService.ensureCallbackServerRunning();
          }

          logger.info('Linear OAuth authorization URL generated', { name });

          return res.json({
            success: true,
            name,
            authUrl,
            callbackUrl: linearModule.IS_LINEAR_OAUTH_PRODUCTION
              ? process.env.LINEAR_OAUTH_CALLBACK_URL
              : linearOAuthService.getCallbackUrl(),
            oauthState: state,
            instructions: 'Complete authorization in the popup window.',
          });
        } catch (error) {
          logger.error('Failed to initiate Linear OAuth', {
            error: error instanceof Error ? error.message : String(error),
          });
          return res.status(500).json({
            error: `Failed to initiate Linear OAuth: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      // For other integrations, return info about required secrets
      res.json({
        success: false,
        message: `Connect flow for ${name} requires configuration. Please enter your credentials.`,
        requiredSecrets: integration.manifest.requiredSecrets,
      });
    } catch (error) {
      logger.error('Failed to connect integration', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to connect integration' });
    }
  });

  logger.info('Integrations routes initialized');

  return router;
}
