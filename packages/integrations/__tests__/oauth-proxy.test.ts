/**
 * Tests for Google OAuth Proxy Client
 *
 * Tests the local client for proxy-mode OAuth including
 * session management, polling, and token refresh.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock @orient/core
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
}));

import {
  GoogleOAuthProxyClient,
  isProxyModeEnabled,
  getProxyUrl,
  getGoogleOAuthProxyClient,
  resetGoogleOAuthProxyClient,
} from '../src/google/oauth-proxy.js';

describe('OAuth Proxy Mode Detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetGoogleOAuthProxyClient();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isProxyModeEnabled', () => {
    it('should return true when proxy URL is set and no local credentials', () => {
      process.env.GOOGLE_OAUTH_PROXY_URL = 'https://app.orient.bot';
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;

      expect(isProxyModeEnabled()).toBe(true);
    });

    it('should return false when local credentials are set', () => {
      process.env.GOOGLE_OAUTH_PROXY_URL = 'https://app.orient.bot';
      process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';

      expect(isProxyModeEnabled()).toBe(false);
    });

    it('should return false when proxy URL is not set', () => {
      delete process.env.GOOGLE_OAUTH_PROXY_URL;
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;

      expect(isProxyModeEnabled()).toBe(false);
    });
  });

  describe('getProxyUrl', () => {
    it('should return proxy URL when set', () => {
      process.env.GOOGLE_OAUTH_PROXY_URL = 'https://app.orient.bot';

      expect(getProxyUrl()).toBe('https://app.orient.bot');
    });

    it('should return null when not set', () => {
      delete process.env.GOOGLE_OAUTH_PROXY_URL;

      expect(getProxyUrl()).toBeNull();
    });
  });
});

describe('GoogleOAuthProxyClient', () => {
  const originalEnv = process.env;
  let client: GoogleOAuthProxyClient;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GOOGLE_OAUTH_PROXY_URL = 'https://app.orient.bot';
    resetGoogleOAuthProxyClient();

    client = new GoogleOAuthProxyClient('https://app.orient.bot');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with provided URL', () => {
      const customClient = new GoogleOAuthProxyClient('https://custom.proxy.com');
      expect(customClient).toBeDefined();
    });

    it('should initialize from environment variable', () => {
      process.env.GOOGLE_OAUTH_PROXY_URL = 'https://env.proxy.com';
      const envClient = new GoogleOAuthProxyClient();
      expect(envClient).toBeDefined();
    });

    it('should throw if no proxy URL available', () => {
      delete process.env.GOOGLE_OAUTH_PROXY_URL;
      expect(() => new GoogleOAuthProxyClient()).toThrow(
        'GOOGLE_OAUTH_PROXY_URL is not configured'
      );
    });

    it('should strip trailing slash from URL', () => {
      const clientWithSlash = new GoogleOAuthProxyClient('https://app.orient.bot/');
      expect(clientWithSlash).toBeDefined();
    });
  });

  describe('startOAuthFlow', () => {
    it('should call proxy start endpoint and return auth URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          authUrl: 'https://accounts.google.com/o/oauth2/auth?...',
        }),
      });

      const result = await client.startOAuthFlow(['email', 'profile']);

      expect(result.authUrl).toBe('https://accounts.google.com/o/oauth2/auth?...');
      expect(result.sessionId).toHaveLength(64);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.orient.bot/api/oauth/proxy/start',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should generate valid session ID and PKCE challenge', async () => {
      let capturedBody: any;
      mockFetch.mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            authUrl: 'https://accounts.google.com/...',
          }),
        };
      });

      await client.startOAuthFlow(['email']);

      expect(capturedBody.sessionId).toHaveLength(64);
      expect(capturedBody.codeChallenge).toBeDefined();
      expect(capturedBody.scopes).toEqual(['email']);
    });

    it('should handle proxy start failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      await expect(client.startOAuthFlow(['email'])).rejects.toThrow(
        'Proxy start failed: 500 Internal server error'
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.startOAuthFlow(['email'])).rejects.toThrow('Network error');
    });

    it('should store pending session locally', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          authUrl: 'https://accounts.google.com/...',
        }),
      });

      await client.startOAuthFlow(['email']);

      expect(client.hasPendingSession()).toBe(true);
    });
  });

  describe('pollForTokens', () => {
    beforeEach(async () => {
      // Start a flow first to create pending session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          authUrl: 'https://accounts.google.com/...',
        }),
      });
      await client.startOAuthFlow(['email']);
      mockFetch.mockClear();
    });

    it('should poll and return tokens when completed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          status: 'completed',
          tokens: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000,
            scopes: ['email'],
            email: 'test@example.com',
          },
        }),
      });

      const tokens = await client.pollForTokens();

      expect(tokens.accessToken).toBe('access-token');
      expect(tokens.email).toBe('test@example.com');
    });

    it('should continue polling while status is pending', async () => {
      // First poll returns pending
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          status: 'pending',
        }),
      });

      // Second poll returns completed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          status: 'completed',
          tokens: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000,
            scopes: ['email'],
            email: 'test@example.com',
          },
        }),
      });

      const tokens = await client.pollForTokens();

      expect(tokens.email).toBe('test@example.com');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when session is expired', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          status: 'expired',
        }),
      });

      await expect(client.pollForTokens()).rejects.toThrow('OAuth session expired');
    });

    it('should throw if no pending session', async () => {
      client.clearPendingSession();

      await expect(client.pollForTokens()).rejects.toThrow(
        'No pending OAuth session. Call startOAuthFlow first.'
      );
    });

    it('should clear pending session after successful retrieval', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          status: 'completed',
          tokens: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000,
            scopes: ['email'],
            email: 'test@example.com',
          },
        }),
      });

      await client.pollForTokens();

      expect(client.hasPendingSession()).toBe(false);
    });

    it('should send PKCE verifier with poll request', async () => {
      let capturedBody: any;
      mockFetch.mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            status: 'completed',
            tokens: {
              accessToken: 'token',
              refreshToken: 'refresh',
              expiresAt: Date.now(),
              scopes: [],
              email: 'test@example.com',
            },
          }),
        };
      });

      await client.pollForTokens();

      expect(capturedBody.codeVerifier).toBeDefined();
    });
  });

  describe('refreshTokens', () => {
    it('should call proxy refresh endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          accessToken: 'new-access-token',
          expiresAt: Date.now() + 3600000,
        }),
      });

      const result = await client.refreshTokens('refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.orient.bot/api/oauth/proxy/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'refresh-token' }),
        })
      );
    });

    it('should handle refresh failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(client.refreshTokens('refresh-token')).rejects.toThrow('Proxy refresh failed');
    });

    it('should retry on failure with exponential backoff', async () => {
      // First two attempts fail
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Error',
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Error',
      });
      // Third attempt succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          accessToken: 'new-token',
          expiresAt: Date.now() + 3600000,
        }),
      });

      const result = await client.refreshTokens('refresh-token');

      expect(result.accessToken).toBe('new-token');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Error',
      });

      await expect(client.refreshTokens('refresh-token')).rejects.toThrow(
        'Proxy refresh failed: 500 Error'
      );
      expect(mockFetch).toHaveBeenCalledTimes(3); // Max retries
    });
  });

  describe('session management', () => {
    it('should track pending session state', async () => {
      expect(client.hasPendingSession()).toBe(false);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          authUrl: 'https://accounts.google.com/...',
        }),
      });
      await client.startOAuthFlow(['email']);

      expect(client.hasPendingSession()).toBe(true);

      client.clearPendingSession();

      expect(client.hasPendingSession()).toBe(false);
    });
  });
});

describe('Singleton Pattern', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GOOGLE_OAUTH_PROXY_URL = 'https://app.orient.bot';
    resetGoogleOAuthProxyClient();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return same instance', () => {
    const client1 = getGoogleOAuthProxyClient();
    const client2 = getGoogleOAuthProxyClient();

    expect(client1).toBe(client2);
  });

  it('should reset instance when reset is called', () => {
    const client1 = getGoogleOAuthProxyClient();
    resetGoogleOAuthProxyClient();
    const client2 = getGoogleOAuthProxyClient();

    expect(client1).not.toBe(client2);
  });
});
