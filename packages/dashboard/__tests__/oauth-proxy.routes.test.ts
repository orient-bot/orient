/**
 * Tests for OAuth Proxy Routes
 *
 * Tests the production server endpoints for Google OAuth proxy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

// Mock database services
const mockCreateSession = vi.fn();
const mockGetSession = vi.fn();
const mockCompleteSession = vi.fn();
const mockGetTokens = vi.fn();
const mockExpireSession = vi.fn().mockResolvedValue(undefined);
const mockCleanupExpired = vi.fn().mockResolvedValue(0);

vi.mock('@orient/database-services', () => ({
  createSecretsService: () => ({
    getSecret: vi.fn().mockImplementation(async (key: string) => {
      const secrets: Record<string, string> = {
        GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
      };
      return secrets[key] || null;
    }),
  }),
  createOAuthProxyService: () => ({
    createSession: mockCreateSession,
    getSession: mockGetSession,
    completeSession: mockCompleteSession,
    getTokens: mockGetTokens,
    expireSession: mockExpireSession,
    cleanupExpired: mockCleanupExpired,
  }),
}));

// Mock @orient/core
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock @orient/integrations
vi.mock('@orient/integrations', () => ({
  DEFAULT_SCOPES: ['email', 'profile'],
}));

// Mock googleapis
const mockGenerateAuthUrl = vi.fn();
const mockGetToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockUserinfoGet = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class MockOAuth2 {
        generateAuthUrl = mockGenerateAuthUrl;
        getToken = mockGetToken;
        setCredentials = mockSetCredentials;
        refreshAccessToken = mockRefreshAccessToken;
      },
    },
    oauth2: () => ({
      userinfo: {
        get: mockUserinfoGet,
      },
    }),
  },
}));

vi.mock('google-auth-library', () => ({
  CodeChallengeMethod: {
    S256: 'S256',
  },
}));

import { createOAuthProxyRoutes } from '../src/server/routes/oauth-proxy.routes.js';

describe('OAuth Proxy Routes', () => {
  let app: Express;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.ENABLE_OAUTH_PROXY = 'true';
    process.env.ORIENT_APP_DOMAIN = 'app.orient.bot';

    // Default mock implementations
    mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/auth?...');
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() + 3600000,
      },
    });
    mockUserinfoGet.mockResolvedValue({
      data: {
        email: 'test@example.com',
        name: 'Test User',
      },
    });
    mockRefreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: 'new-access-token',
        expiry_date: Date.now() + 3600000,
      },
    });

    app = express();
    app.use(express.json());
    app.use('/api/oauth/proxy', createOAuthProxyRoutes());

    // Wait for async initialization
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /api/oauth/proxy/start', () => {
    it('should start OAuth session and return auth URL', async () => {
      mockCreateSession.mockResolvedValueOnce({
        id: 1,
        sessionId: 'a'.repeat(64),
        codeChallenge: 'challenge',
        scopes: ['email', 'profile'],
        status: 'pending',
      });

      const response = await request(app)
        .post('/api/oauth/proxy/start')
        .send({
          sessionId: 'a'.repeat(64),
          codeChallenge: 'test-challenge',
          scopes: ['email', 'profile'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.authUrl).toContain('accounts.google.com');
    });

    it('should reject invalid session ID', async () => {
      const response = await request(app)
        .post('/api/oauth/proxy/start')
        .send({
          sessionId: 'too-short',
          codeChallenge: 'challenge',
          scopes: ['email'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid sessionId');
    });

    it('should reject missing code challenge', async () => {
      const response = await request(app)
        .post('/api/oauth/proxy/start')
        .send({
          sessionId: 'a'.repeat(64),
          scopes: ['email'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing codeChallenge');
    });

    it('should return 403 when proxy is disabled', async () => {
      process.env.ENABLE_OAUTH_PROXY = 'false';

      // Recreate routes with new env
      app = express();
      app.use(express.json());
      app.use('/api/oauth/proxy', createOAuthProxyRoutes());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await request(app)
        .post('/api/oauth/proxy/start')
        .send({
          sessionId: 'a'.repeat(64),
          codeChallenge: 'challenge',
          scopes: ['email'],
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('not enabled');
    });

    it('should use default scopes when not provided', async () => {
      mockCreateSession.mockResolvedValueOnce({
        id: 1,
        sessionId: 'a'.repeat(64),
        codeChallenge: 'challenge',
        scopes: ['email', 'profile'],
        status: 'pending',
      });

      const response = await request(app)
        .post('/api/oauth/proxy/start')
        .send({
          sessionId: 'a'.repeat(64),
          codeChallenge: 'test-challenge',
          // No scopes provided
        });

      expect(response.status).toBe(200);
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: ['email', 'profile'], // Default scopes
        })
      );
    });
  });

  describe('POST /api/oauth/proxy/tokens/:session_id', () => {
    it('should return tokens for completed session', async () => {
      mockGetSession.mockResolvedValueOnce({
        id: 1,
        sessionId: 'test-session',
        status: 'completed',
      });

      mockGetTokens.mockResolvedValueOnce({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        scopes: ['email'],
        email: 'test@example.com',
      });

      const response = await request(app)
        .post('/api/oauth/proxy/tokens/test-session')
        .send({ codeVerifier: 'test-verifier' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tokens.email).toBe('test@example.com');
    });

    it('should return pending status while waiting', async () => {
      mockGetSession.mockResolvedValueOnce({
        id: 1,
        sessionId: 'test-session',
        status: 'pending',
      });

      const response = await request(app)
        .post('/api/oauth/proxy/tokens/test-session')
        .send({ codeVerifier: 'test-verifier' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending');
    });

    it('should return 404 for non-existent session', async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/oauth/proxy/tokens/non-existent')
        .send({ codeVerifier: 'test-verifier' });

      expect(response.status).toBe(404);
    });

    it('should return expired status for expired/retrieved sessions', async () => {
      mockGetSession.mockResolvedValueOnce({
        id: 1,
        sessionId: 'test-session',
        status: 'expired',
      });

      const response = await request(app)
        .post('/api/oauth/proxy/tokens/test-session')
        .send({ codeVerifier: 'test-verifier' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('expired');
    });

    it('should reject invalid PKCE verifier', async () => {
      mockGetSession.mockResolvedValueOnce({
        id: 1,
        sessionId: 'test-session',
        status: 'completed',
      });

      mockGetTokens.mockResolvedValueOnce(null); // PKCE validation failed

      const response = await request(app)
        .post('/api/oauth/proxy/tokens/test-session')
        .send({ codeVerifier: 'wrong-verifier' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Invalid PKCE');
    });

    it('should require codeVerifier', async () => {
      const response = await request(app).post('/api/oauth/proxy/tokens/test-session').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing');
    });
  });

  describe('POST /api/oauth/proxy/refresh', () => {
    it('should refresh token and return new access token', async () => {
      const response = await request(app)
        .post('/api/oauth/proxy/refresh')
        .send({ refreshToken: 'refresh-token' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBe('new-access-token');
    });

    it('should reject missing refresh token', async () => {
      const response = await request(app).post('/api/oauth/proxy/refresh').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing refreshToken');
    });

    it('should handle refresh failure', async () => {
      mockRefreshAccessToken.mockRejectedValueOnce(new Error('Invalid refresh token'));

      const response = await request(app)
        .post('/api/oauth/proxy/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to refresh');
    });
  });

  describe('GET /api/oauth/proxy/status', () => {
    it('should return proxy status', async () => {
      const response = await request(app).get('/api/oauth/proxy/status');

      expect(response.status).toBe(200);
      expect(response.body.enabled).toBe(true);
      expect(response.body.configured).toBe(true);
      expect(response.body.callbackUrl).toContain('app.orient.bot');
    });

    it('should show disabled status when proxy is disabled', async () => {
      process.env.ENABLE_OAUTH_PROXY = 'false';

      app = express();
      app.use(express.json());
      app.use('/api/oauth/proxy', createOAuthProxyRoutes());
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await request(app).get('/api/oauth/proxy/status');

      expect(response.status).toBe(200);
      expect(response.body.enabled).toBe(false);
    });
  });

  describe('GET /api/oauth/proxy/callback', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        id: 1,
        sessionId: 'test-session',
        status: 'pending',
        scopes: ['email', 'profile'],
      });
      mockCompleteSession.mockResolvedValue(true);
    });

    it('should handle Google callback and store tokens', async () => {
      const response = await request(app).get('/api/oauth/proxy/callback').query({
        code: 'auth-code',
        state: 'test-session',
      });

      expect(response.status).toBe(200);
      expect(response.text).toContain('Google Account Connected');
      expect(mockCompleteSession).toHaveBeenCalled();
    });

    it('should handle OAuth error from Google', async () => {
      const response = await request(app).get('/api/oauth/proxy/callback').query({
        error: 'access_denied',
        error_description: 'User denied access',
        state: 'test-session',
      });

      expect(response.status).toBe(400);
      expect(response.text).toContain('User denied access');
    });

    it('should reject missing state parameter', async () => {
      const response = await request(app).get('/api/oauth/proxy/callback').query({
        code: 'auth-code',
      });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Missing state');
    });

    it('should reject unknown session', async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const response = await request(app).get('/api/oauth/proxy/callback').query({
        code: 'auth-code',
        state: 'unknown-session',
      });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid or expired session');
    });

    it('should reject non-pending session', async () => {
      mockGetSession.mockResolvedValueOnce({
        id: 1,
        sessionId: 'test-session',
        status: 'completed', // Already completed
      });

      const response = await request(app).get('/api/oauth/proxy/callback').query({
        code: 'auth-code',
        state: 'test-session',
      });

      expect(response.status).toBe(400);
      expect(response.text).toContain('already completed');
    });

    it('should handle token exchange failure', async () => {
      mockGetToken.mockRejectedValueOnce(new Error('Token exchange failed'));

      const response = await request(app).get('/api/oauth/proxy/callback').query({
        code: 'invalid-code',
        state: 'test-session',
      });

      expect(response.status).toBe(500);
      expect(response.text).toContain('Token exchange failed');
      expect(mockExpireSession).toHaveBeenCalledWith('test-session');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on start endpoint', async () => {
      mockCreateSession.mockResolvedValue({
        id: 1,
        sessionId: 'test',
        status: 'pending',
      });

      // Make 11 requests (limit is 10 per minute)
      const requests = Array(11)
        .fill(null)
        .map(() =>
          request(app)
            .post('/api/oauth/proxy/start')
            .send({
              sessionId: 'a'.repeat(64),
              codeChallenge: 'challenge',
              scopes: ['email'],
            })
        );

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter((r) => r.status === 429);

      expect(tooManyRequests.length).toBeGreaterThan(0);
    });
  });
});
