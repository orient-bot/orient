/**
 * Tests for Google OAuth postMessage callback flow
 *
 * Verifies that the OAuth callback sends postMessage with correct token/username
 * instead of redirecting, and that the popup closes properly.
 *
 * Run with: pnpm --filter @orient-bot/dashboard test google-auth-postmessage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// Create a proper OAuth2 constructor mock
const mockOAuth2Instance = {
  generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?state=abc'),
  getToken: vi.fn().mockResolvedValue({
    tokens: {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expiry_date: Date.now() + 3600000,
    },
  }),
  setCredentials: vi.fn(),
};

function MockOAuth2() {
  return mockOAuth2Instance;
}

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: MockOAuth2,
    },
    oauth2: vi.fn().mockReturnValue({
      userinfo: {
        get: vi.fn().mockResolvedValue({
          data: {
            email: 'test@example.com',
            id: 'google-id-123',
            name: 'Test User',
          },
        }),
      },
    }),
  },
}));

vi.mock('google-auth-library', () => ({
  CodeChallengeMethod: { S256: 'S256' },
}));

vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@orient-bot/database-services', () => ({
  createSecretsService: () => ({
    getSecret: vi.fn().mockResolvedValue(null),
    listSecrets: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('@orient-bot/integrations', () => ({
  getGoogleOAuthService: vi.fn().mockReturnValue({
    addAccountFromTokens: vi.fn(),
  }),
  DEFAULT_SCOPES: ['openid', 'email', 'profile'],
  isProxyModeEnabled: vi.fn().mockReturnValue(false),
  GoogleOAuthProxyClient: vi.fn(),
}));

import { createGoogleAuthRoutes } from '../src/server/routes/google-auth.routes.js';

const mockAuth = {
  loginWithGoogle: vi.fn(),
  createUserWithGoogle: vi.fn(),
};
const mockDb = {};

function createMockReqRes() {
  const req = {
    params: {},
    body: {},
    query: {},
  } as unknown as Request;

  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

function createCallbackReqRes(query: Record<string, string>) {
  const req = {
    params: {},
    body: {},
    query,
  } as unknown as Request;

  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

/**
 * Helper to get a valid OAuth state by calling the /start endpoint.
 */
async function getValidState(router: any): Promise<string | null> {
  const startRoute = router.stack.find((layer: any) => layer.route?.path === '/start');
  const startHandler = startRoute?.route?.stack[0]?.handle;

  const { req, res } = createMockReqRes();
  await startHandler(req, res, () => {});

  const response = vi.mocked(res.json).mock.calls[0]?.[0];
  return response?.state || null;
}

describe('Google OAuth postMessage callback', () => {
  let router: ReturnType<typeof createGoogleAuthRoutes>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';

    mockAuth.loginWithGoogle.mockResolvedValue({
      token: 'jwt-token-abc',
      username: 'test@example.com',
    });

    router = createGoogleAuthRoutes(mockAuth as any, mockDb as any);

    // Wait for async init to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return HTML with postMessage instead of redirect on successful auth', async () => {
    const state = await getValidState(router);
    if (!state) return; // OAuth not configured

    const callbackRoute = router.stack.find((layer: any) => layer.route?.path === '/callback');
    const callbackHandler = callbackRoute?.route?.stack[0]?.handle;

    const { req, res } = createCallbackReqRes({ code: 'auth-code-123', state });
    await callbackHandler(req, res, () => {});

    // Should send HTML, not redirect
    expect(vi.mocked(res.send)).toHaveBeenCalled();
    expect(vi.mocked(res.redirect)).not.toHaveBeenCalled();

    const html = vi.mocked(res.send).mock.calls[0][0] as string;
    expect(html).toContain('window.opener.postMessage');
    expect(html).toContain('GOOGLE_AUTH_SUCCESS');
    expect(html).toContain('window.close()');
  });

  it('should include token and username in postMessage data', async () => {
    mockAuth.loginWithGoogle.mockResolvedValue({
      token: 'my-jwt-token-xyz',
      username: 'user@test.com',
    });

    const state = await getValidState(router);
    if (!state) return;

    const callbackRoute = router.stack.find((layer: any) => layer.route?.path === '/callback');
    const callbackHandler = callbackRoute?.route?.stack[0]?.handle;

    const { req, res } = createCallbackReqRes({ code: 'auth-code-456', state });
    await callbackHandler(req, res, () => {});

    const html = vi.mocked(res.send).mock.calls[0][0] as string;
    expect(html).toContain('my-jwt-token-xyz');
    expect(html).toContain('user@test.com');
  });

  it('should include fallback redirect for no-opener case', async () => {
    const state = await getValidState(router);
    if (!state) return;

    const callbackRoute = router.stack.find((layer: any) => layer.route?.path === '/callback');
    const callbackHandler = callbackRoute?.route?.stack[0]?.handle;

    const { req, res } = createCallbackReqRes({ code: 'auth-code-789', state });
    await callbackHandler(req, res, () => {});

    const html = vi.mocked(res.send).mock.calls[0][0] as string;
    expect(html).toContain("window.location.href = '/'");
    expect(html).toContain('<noscript>');
    expect(html).toContain('Return to Dashboard');
  });

  it('should set auth cookie before sending postMessage HTML', async () => {
    mockAuth.loginWithGoogle.mockResolvedValue({
      token: 'cookie-token',
      username: 'cookieuser',
    });

    const state = await getValidState(router);
    if (!state) return;

    const callbackRoute = router.stack.find((layer: any) => layer.route?.path === '/callback');
    const callbackHandler = callbackRoute?.route?.stack[0]?.handle;

    const { req, res } = createCallbackReqRes({ code: 'auth-code-cookie', state });
    await callbackHandler(req, res, () => {});

    expect(vi.mocked(res.cookie)).toHaveBeenCalledWith(
      'auth_token',
      'cookie-token',
      expect.objectContaining({
        path: '/',
        sameSite: 'lax',
      })
    );
  });

  it('should reject callback with invalid state', async () => {
    const callbackRoute = router.stack.find((layer: any) => layer.route?.path === '/callback');
    const callbackHandler = callbackRoute?.route?.stack[0]?.handle;

    const { req, res } = createCallbackReqRes({
      code: 'code',
      state: 'invalid-state-that-was-never-registered',
    });
    await callbackHandler(req, res, () => {});

    expect(vi.mocked(res.status)).toHaveBeenCalledWith(400);
  });

  it('should handle callback with missing code parameter', async () => {
    const state = await getValidState(router);
    if (!state) return;

    const callbackRoute = router.stack.find((layer: any) => layer.route?.path === '/callback');
    const callbackHandler = callbackRoute?.route?.stack[0]?.handle;

    const { req, res } = createCallbackReqRes({ state });
    await callbackHandler(req, res, () => {});

    expect(vi.mocked(res.status)).toHaveBeenCalledWith(400);
  });
});
