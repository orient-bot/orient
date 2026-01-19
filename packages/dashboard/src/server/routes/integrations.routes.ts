/**
 * Integrations Routes
 *
 * API endpoints for the Integration Catalog.
 * Provides a unified view of all integrations with OAuth connection support.
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@orient/core';
import { createSecretsService } from '@orient/database-services';

const logger = createServiceLogger('integrations-routes');

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
      googleOAuthServiceModule = await import('@orient/integrations/google');
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
  return gitHubOAuthModule;
}

/**
 * Catalog integration data
 * Note: In the future, this could be loaded from INTEGRATION.yaml files
 */
const CATALOG_INTEGRATIONS = [
  {
    manifest: {
      name: 'google',
      title: 'Google Workspace',
      description:
        'Access Gmail, Google Calendar, Drive, Sheets, Docs, and Tasks. Manage emails, events, files, and more.',
      version: '1.0.0',
      status: 'stable',
      docsUrl: 'https://developers.google.com/workspace',
      oauth: {
        type: 'oauth2',
        scopes: [
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/tasks',
        ],
      },
      tools: [
        { name: 'gmail.send', description: 'Send emails', category: 'gmail' },
        { name: 'gmail.search', description: 'Search emails', category: 'gmail' },
        { name: 'calendar.list', description: 'List calendar events', category: 'calendar' },
        { name: 'calendar.create', description: 'Create calendar events', category: 'calendar' },
        { name: 'drive.list', description: 'List Drive files', category: 'drive' },
        { name: 'tasks.list', description: 'List tasks', category: 'tasks' },
      ],
      requiredSecrets: [
        {
          name: 'GOOGLE_OAUTH_CLIENT_ID',
          description: 'OAuth Client ID',
          category: 'oauth',
          required: true,
        },
        {
          name: 'GOOGLE_OAUTH_CLIENT_SECRET',
          description: 'OAuth Client Secret',
          category: 'oauth',
          required: true,
        },
      ],
    },
    secretsConfigured: false,
    isConnected: false,
  },
  {
    manifest: {
      name: 'atlassian',
      title: 'Atlassian (JIRA & Confluence)',
      description:
        'Access JIRA for issue tracking and project management, and Confluence for documentation and collaboration.',
      version: '1.0.0',
      status: 'stable',
      docsUrl: 'https://developer.atlassian.com/',
      oauth: {
        type: 'oauth2',
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
  },
  {
    manifest: {
      name: 'github',
      title: 'GitHub',
      description:
        'Complete GitHub integration for repository management, pull requests, issues, actions, and code collaboration.',
      version: '1.0.0',
      status: 'stable',
      docsUrl: 'https://docs.github.com/en/rest',
      oauth: {
        type: 'oauth2',
        scopes: ['repo', 'read:user', 'user:email', 'read:org', 'workflow'],
      },
      tools: [
        { name: 'repos.list', description: 'List repositories', category: 'repositories' },
        { name: 'pulls.list', description: 'List pull requests', category: 'pull-requests' },
        { name: 'pulls.create', description: 'Create a pull request', category: 'pull-requests' },
        { name: 'issues.list', description: 'List issues', category: 'issues' },
        { name: 'actions.trigger', description: 'Trigger a workflow', category: 'actions' },
      ],
      requiredSecrets: [
        {
          name: 'GITHUB_CLIENT_ID',
          description: 'OAuth Client ID',
          category: 'oauth',
          required: true,
        },
        {
          name: 'GITHUB_CLIENT_SECRET',
          description: 'OAuth Client Secret',
          category: 'oauth',
          required: true,
        },
      ],
    },
    secretsConfigured: false,
    isConnected: false,
  },
  {
    manifest: {
      name: 'linear',
      title: 'Linear',
      description:
        'Project management and issue tracking with Linear. Access issues, projects, cycles, teams, and workflows.',
      version: '1.0.0',
      status: 'beta',
      docsUrl: 'https://developers.linear.app/docs',
      oauth: {
        type: 'oauth2',
        scopes: ['read', 'write', 'issues:create', 'comments:create'],
      },
      tools: [
        { name: 'issues.list', description: 'List issues with filters', category: 'issues' },
        { name: 'issues.create', description: 'Create a new issue', category: 'issues' },
        { name: 'projects.list', description: 'List all projects', category: 'projects' },
        { name: 'cycles.current', description: 'Get current active cycle', category: 'cycles' },
      ],
      requiredSecrets: [
        {
          name: 'LINEAR_CLIENT_ID',
          description: 'OAuth Client ID',
          category: 'oauth',
          required: true,
        },
        {
          name: 'LINEAR_CLIENT_SECRET',
          description: 'OAuth Client Secret',
          category: 'oauth',
          required: true,
        },
      ],
    },
    secretsConfigured: false,
    isConnected: false,
  },
];

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
          activeIntegrations.push('jira');
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

  // Get integration catalog
  router.get('/catalog', requireAuth, async (_req: Request, res: Response) => {
    try {
      // Build catalog with actual connection status
      const catalog = await Promise.all(
        CATALOG_INTEGRATIONS.map(async (integration) => {
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
      const { name } = req.params;
      const integration = CATALOG_INTEGRATIONS.find((i) => i.manifest.name === name);

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

  // Initiate OAuth connection for an integration
  router.post('/connect/:name', requireAuth, async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const integration = CATALOG_INTEGRATIONS.find((i) => i.manifest.name === name);

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
            instructions: `Open ${openCodeUrl} and use any JIRA tool to trigger authentication.`,
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

      // For other integrations (Linear), return setup instructions
      res.json({
        success: false,
        message: `Connect flow for ${name} will be implemented. Configure secrets first in the Secrets tab.`,
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
