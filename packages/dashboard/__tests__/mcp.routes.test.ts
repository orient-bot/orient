/**
 * Tests for MCP Routes
 *
 * Tests for the MCP (Model Context Protocol) server management routes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Use vi.hoisted to ensure mock values are available for hoisted vi.mock calls
const { mockGoogleOAuthService, mockAtlassianOAuthProvider } = vi.hoisted(() => ({
  mockGoogleOAuthService: {
    getConnectedAccounts: vi.fn().mockReturnValue([]),
    startOAuthFlow: vi.fn().mockResolvedValue({
      authUrl: 'https://accounts.google.com/o/oauth2/auth?test=1',
      state: 'test-state',
    }),
    ensureCallbackServerRunning: vi.fn().mockResolvedValue(undefined),
  },
  mockAtlassianOAuthProvider: {
    tokens: vi.fn().mockResolvedValue(null),
  },
}));

// Mock core
vi.mock('@orientbot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock database-services
vi.mock('@orientbot/database-services', () => ({
  createSecretsService: () => ({
    getSecret: vi.fn().mockResolvedValue(null),
    listSecrets: vi.fn().mockResolvedValue([]),
    setSecret: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock Google OAuth module
vi.mock('@orientbot/integrations/google', () => ({
  getGoogleOAuthService: () => mockGoogleOAuthService,
  DEFAULT_SCOPES: ['email', 'profile'],
  IS_GOOGLE_OAUTH_PRODUCTION: false,
}));

// Mock Atlassian OAuth module
vi.mock('@orientbot/mcp-servers/oauth', () => ({
  setSuppressBrowserOpen: vi.fn(),
  IS_PRODUCTION_OAUTH: false,
  OAUTH_CALLBACK_URL: 'http://localhost:8766/oauth/atlassian/callback',
  ensureCallbackServerRunning: vi.fn().mockResolvedValue(undefined),
  createOAuthProvider: vi.fn().mockReturnValue(mockAtlassianOAuthProvider),
  getAtlassianOAuthService: vi.fn(),
}));

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { createMcpRoutes } from '../src/server/routes/mcp.routes.js';

// Helper to create mock request/response
const createMockReqRes = () => {
  const req = {
    params: {},
    body: {},
    headers: {},
  } as unknown as Request;

  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
};

// Mock auth middleware that always passes
const mockRequireAuth = vi.fn((req: Request, res: Response, next: () => void) => next());

describe('MCP Routes', () => {
  let router: ReturnType<typeof createMcpRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMcpRoutes(mockRequireAuth);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createMcpRoutes', () => {
    it('should create a router', () => {
      expect(router).toBeDefined();
    });

    it('should have /servers route', () => {
      const serversRoute = router.stack.find((layer) => layer.route?.path === '/servers');
      expect(serversRoute).toBeDefined();
    });

    it('should have /oauth/config route', () => {
      const configRoute = router.stack.find((layer) => layer.route?.path === '/oauth/config');
      expect(configRoute).toBeDefined();
    });

    it('should have /oauth/authorize/:serverName route', () => {
      const authorizeRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/authorize/:serverName'
      );
      expect(authorizeRoute).toBeDefined();
    });

    it('should have /oauth/complete/:serverName route', () => {
      const completeRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/complete/:serverName'
      );
      expect(completeRoute).toBeDefined();
    });

    it('should have /oauth/tokens/:serverName route', () => {
      const tokensRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/tokens/:serverName'
      );
      expect(tokensRoute).toBeDefined();
    });
  });

  describe('GET /servers', () => {
    it('should return servers list when config exists', async () => {
      const mockConfig = {
        mcp: {
          'test-server': {
            type: 'remote',
            url: 'https://test.example.com',
            enabled: true,
          },
        },
      };

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p).includes('opencode.json')) return true;
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('opencode.json')) {
          return JSON.stringify(mockConfig);
        }
        return '{}';
      });

      const { req, res } = createMockReqRes();

      // Get the route handler
      const serversRoute = router.stack.find((layer) => layer.route?.path === '/servers');

      // Execute the handler (skip auth middleware at index 0)
      const handler = serversRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response).toHaveProperty('servers');
      expect(Array.isArray(response.servers)).toBe(true);
    });

    it('should include atlassian and google servers by default', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { req, res } = createMockReqRes();

      const serversRoute = router.stack.find((layer) => layer.route?.path === '/servers');

      const handler = serversRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];

      // Should include default atlassian and google servers
      const serverNames = response.servers.map((s: { name: string }) => s.name.toLowerCase());
      expect(serverNames).toContain('atlassian');
      expect(serverNames.some((n: string) => n.includes('google'))).toBe(true);
    });
  });

  describe('GET /oauth/config', () => {
    it('should return OAuth callback configuration', async () => {
      const { req, res } = createMockReqRes();

      const configRoute = router.stack.find((layer) => layer.route?.path === '/oauth/config');

      const handler = configRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];

      expect(response).toHaveProperty('redirectUrl');
      expect(response).toHaveProperty('isProduction');
      expect(response).toHaveProperty('callbackHost');
      expect(response).toHaveProperty('callbackPort');
    });

    it('should detect production mode correctly', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const { req, res } = createMockReqRes();

      const configRoute = router.stack.find((layer) => layer.route?.path === '/oauth/config');

      const handler = configRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.isProduction).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('POST /oauth/authorize/:serverName', () => {
    // Note: Google OAuth tests are skipped because they depend on complex
    // lazy-loaded module mocking that doesn't work reliably with dynamic imports.
    // The OAuth functionality is integration tested elsewhere.
    it.skip('should handle Google OAuth authorization request', async () => {
      const originalEnv = { ...process.env };
      process.env.NODE_ENV = 'production';
      process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';

      const { req, res } = createMockReqRes();
      req.params = { serverName: 'google' };

      const authorizeRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/authorize/:serverName'
      );

      const handler = authorizeRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];

      expect(response.success).toBe(true);
      expect(response.serverName).toBe('google');
      expect(response.authUrl).toContain('accounts.google.com');

      // Restore env
      process.env = originalEnv;
    });

    it.skip('should return error when Google OAuth not configured', async () => {
      const originalEnv = { ...process.env };
      process.env.NODE_ENV = 'production';
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;

      const { req, res } = createMockReqRes();
      req.params = { serverName: 'google' };

      const authorizeRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/authorize/:serverName'
      );

      const handler = authorizeRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.error).toContain('Google OAuth not configured');

      process.env = originalEnv;
    });

    it('should indicate Atlassian requires OpenCode', async () => {
      const originalEnv = { ...process.env };
      process.env.NODE_ENV = 'production';

      // Re-setup mock return values cleared by vi.clearAllMocks()
      mockAtlassianOAuthProvider.tokens.mockResolvedValue(null);

      const { req, res } = createMockReqRes();
      req.params = { serverName: 'atlassian' };

      const authorizeRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/authorize/:serverName'
      );

      const handler = authorizeRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];

      expect(response.success).toBe(true);
      expect(response.requiresOpenCode).toBe(true);

      process.env = originalEnv;
    });
  });

  describe('DELETE /oauth/tokens/:serverName', () => {
    it('should clear Google OAuth tokens', async () => {
      const mockGoogleData = {
        accounts: { 'test@example.com': { tokens: {} } },
        defaultAccount: 'test@example.com',
      };

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p).includes('google-oauth.json')) return true;
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('google-oauth.json')) {
          return JSON.stringify(mockGoogleData);
        }
        return '{}';
      });

      const { req, res } = createMockReqRes();
      req.params = { serverName: 'google' };

      const tokensRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/tokens/:serverName'
      );

      const handler = tokensRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should clear MCP auth tokens', async () => {
      const mockAuthData = {
        'test-server': { tokens: { accessToken: 'test-token' } },
      };

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p).includes('mcp-auth.json')) return true;
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('mcp-auth.json')) {
          return JSON.stringify(mockAuthData);
        }
        return '{}';
      });

      const { req, res } = createMockReqRes();
      req.params = { serverName: 'test-server' };

      const tokensRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/tokens/:serverName'
      );

      const handler = tokensRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should handle non-existent tokens gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { req, res } = createMockReqRes();
      req.params = { serverName: 'nonexistent' };

      const tokensRoute = router.stack.find(
        (layer) => layer.route?.path === '/oauth/tokens/:serverName'
      );

      const handler = tokensRoute?.route?.stack[1]?.handle;
      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalled();
      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.success).toBe(true);
    });
  });
});

describe('getCallbackConfig', () => {
  it('should return production config when NODE_ENV is production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Re-import to get fresh config
    const { createMcpRoutes } = await import('../src/server/routes/mcp.routes.js');
    const router = createMcpRoutes(mockRequireAuth);

    const { req, res } = createMockReqRes();

    const configRoute = router.stack.find((layer) => layer.route?.path === '/oauth/config');

    const handler = configRoute?.route?.stack[1]?.handle;
    if (handler) {
      await handler(req, res, () => {});
    }

    const response = vi.mocked(res.json).mock.calls[0][0];
    expect(response.isProduction).toBe(true);
    expect(response.redirectUrl).toContain('https://');

    process.env.NODE_ENV = originalEnv;
  });

  it('should return development config when NODE_ENV is not production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    delete process.env.IS_DOCKER;

    vi.resetModules();
    const { createMcpRoutes } = await import('../src/server/routes/mcp.routes.js');
    const router = createMcpRoutes(mockRequireAuth);

    const { req, res } = createMockReqRes();

    const configRoute = router.stack.find((layer) => layer.route?.path === '/oauth/config');

    const handler = configRoute?.route?.stack[1]?.handle;
    if (handler) {
      await handler(req, res, () => {});
    }

    const response = vi.mocked(res.json).mock.calls[0][0];
    expect(response.isProduction).toBe(false);
    expect(response.redirectUrl).toContain('http://127.0.0.1');

    process.env.NODE_ENV = originalEnv;
  });
});

describe('getMCPServersStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse opencode.json config correctly', async () => {
    const mockConfig = {
      mcp: {
        'custom-server': {
          type: 'remote',
          url: 'https://custom.example.com',
          enabled: true,
        },
        'local-server': {
          command: ['node', 'server.js'],
          enabled: true,
        },
      },
    };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (String(p).includes('opencode.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('opencode.json')) {
        return JSON.stringify(mockConfig);
      }
      return '{}';
    });

    const router = createMcpRoutes(mockRequireAuth);
    const { req, res } = createMockReqRes();

    const serversRoute = router.stack.find((layer) => layer.route?.path === '/servers');

    const handler = serversRoute?.route?.stack[1]?.handle;
    if (handler) {
      await handler(req, res, () => {});
    }

    const response = vi.mocked(res.json).mock.calls[0][0];

    // Should have custom servers plus defaults
    const serverNames = response.servers.map((s: { name: string }) => s.name);
    expect(serverNames).toContain('custom-server');
    expect(serverNames).toContain('local-server');
  });

  it('should detect token status from mcp-auth.json', async () => {
    const mockConfig = {
      mcp: {
        'authenticated-server': {
          type: 'remote',
          url: 'https://auth.example.com',
          enabled: true,
        },
      },
    };

    const mockAuthData = {
      'authenticated-server': {
        tokens: {
          accessToken: 'valid-token',
          expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        },
      },
    };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (String(p).includes('opencode.json')) return true;
      if (String(p).includes('mcp-auth.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('opencode.json')) {
        return JSON.stringify(mockConfig);
      }
      if (String(p).includes('mcp-auth.json')) {
        return JSON.stringify(mockAuthData);
      }
      return '{}';
    });

    const router = createMcpRoutes(mockRequireAuth);
    const { req, res } = createMockReqRes();

    const serversRoute = router.stack.find((layer) => layer.route?.path === '/servers');

    const handler = serversRoute?.route?.stack[1]?.handle;
    if (handler) {
      await handler(req, res, () => {});
    }

    const response = vi.mocked(res.json).mock.calls[0][0];
    const authServer = response.servers.find(
      (s: { name: string }) => s.name === 'authenticated-server'
    );

    expect(authServer).toBeDefined();
    expect(authServer.hasTokens).toBe(true);
    expect(authServer.connected).toBe(true);
  });

  it('should mark expired tokens as not valid', async () => {
    const mockConfig = {
      mcp: {
        'expired-server': {
          type: 'remote',
          url: 'https://expired.example.com',
          enabled: true,
        },
      },
    };

    const mockAuthData = {
      'expired-server': {
        tokens: {
          accessToken: 'expired-token',
          expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
        },
      },
    };

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (String(p).includes('opencode.json')) return true;
      if (String(p).includes('mcp-auth.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('opencode.json')) {
        return JSON.stringify(mockConfig);
      }
      if (String(p).includes('mcp-auth.json')) {
        return JSON.stringify(mockAuthData);
      }
      return '{}';
    });

    const router = createMcpRoutes(mockRequireAuth);
    const { req, res } = createMockReqRes();

    const serversRoute = router.stack.find((layer) => layer.route?.path === '/servers');

    const handler = serversRoute?.route?.stack[1]?.handle;
    if (handler) {
      await handler(req, res, () => {});
    }

    const response = vi.mocked(res.json).mock.calls[0][0];
    const expiredServer = response.servers.find(
      (s: { name: string }) => s.name === 'expired-server'
    );

    expect(expiredServer).toBeDefined();
    expect(expiredServer.hasTokens).toBe(false);
  });
});
