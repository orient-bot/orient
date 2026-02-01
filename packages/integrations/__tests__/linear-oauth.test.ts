/**
 * Tests for Linear OAuth Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('@orient-bot/core', () => ({
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

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  LinearOAuthService,
  getLinearOAuthService,
  resetLinearOAuthService,
  DEFAULT_LINEAR_SCOPES,
} from '../src/catalog/linear/oauth.js';

describe('Linear OAuth Service', () => {
  let service: LinearOAuthService;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    resetLinearOAuthService();

    // Set up test environment variables
    process.env = {
      ...originalEnv,
      LINEAR_CLIENT_ID: 'test-client-id',
      LINEAR_CLIENT_SECRET: 'test-client-secret',
    };

    service = new LinearOAuthService();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetLinearOAuthService();
  });

  describe('DEFAULT_LINEAR_SCOPES', () => {
    it('should include essential Linear scopes', () => {
      expect(DEFAULT_LINEAR_SCOPES).toContain('read');
      expect(DEFAULT_LINEAR_SCOPES).toContain('write');
      expect(DEFAULT_LINEAR_SCOPES).toContain('issues:create');
      expect(DEFAULT_LINEAR_SCOPES).toContain('comments:create');
    });
  });

  describe('getCallbackUrl', () => {
    it('should return local callback URL when not in production', () => {
      delete process.env.LINEAR_OAUTH_CALLBACK_URL;
      const newService = new LinearOAuthService();
      const url = newService.getCallbackUrl();

      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/linear\/callback$/);
    });
  });

  describe('startOAuthFlow', () => {
    it('should generate an auth URL with required parameters', async () => {
      const { authUrl, state } = await service.startOAuthFlow();

      expect(state).toBeDefined();
      expect(state.length).toBe(64); // 32 bytes hex = 64 chars

      expect(authUrl).toContain('https://linear.app/oauth/authorize');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain(`state=${state}`);
    });

    it('should include scopes in the auth URL (comma-separated)', async () => {
      const { authUrl } = await service.startOAuthFlow(['read', 'write']);

      expect(authUrl).toContain('scope=read%2Cwrite');
    });

    it('should use default scopes when none provided', async () => {
      const { authUrl } = await service.startOAuthFlow();

      expect(authUrl).toContain('scope=');
      expect(authUrl).toContain('read');
    });

    it('should throw error when client credentials are missing', async () => {
      delete process.env.LINEAR_CLIENT_ID;
      delete process.env.LINEAR_CLIENT_SECRET;
      const newService = new LinearOAuthService();

      await expect(newService.startOAuthFlow()).rejects.toThrow(
        'Linear OAuth credentials not configured'
      );
    });
  });

  describe('handleCallback', () => {
    it('should throw error for invalid state', async () => {
      await expect(service.handleCallback('code', 'invalid-state')).rejects.toThrow(
        'Invalid or expired state parameter'
      );
    });

    it('should exchange code for tokens successfully', async () => {
      // Start OAuth flow to create valid state
      const { state } = await service.startOAuthFlow();

      // Mock token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
      });

      // Mock user info response (GraphQL)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              viewer: {
                id: 'user-123',
                email: 'test@example.com',
                name: 'Test User',
                displayName: 'Test Display Name',
                avatarUrl: 'https://avatar.url',
                organization: {
                  id: 'org-123',
                  name: 'Test Org',
                },
              },
            },
          }),
      });

      const account = await service.handleCallback('auth-code', state);

      expect(account).toBeDefined();
      expect(account.id).toBe('user-123');
      expect(account.email).toBe('test@example.com');
      expect(account.displayName).toBe('Test Display Name');
      expect(account.organizationName).toBe('Test Org');
    });

    it('should throw error when token exchange fails', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid code'),
      });

      await expect(service.handleCallback('invalid-code', state)).rejects.toThrow(
        'Token exchange failed'
      );
    });

    it('should throw error when viewer data is missing', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'test-access-token',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {},
          }),
      });

      await expect(service.handleCallback('code', state)).rejects.toThrow(
        'Failed to get viewer data'
      );
    });

    it('should handle user without organization', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'test-access-token',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              viewer: {
                id: 'user-123',
                email: 'test@example.com',
                name: 'Test User',
                // No organization
              },
            },
          }),
      });

      const account = await service.handleCallback('code', state);

      expect(account).toBeDefined();
      expect(account.organizationName).toBeUndefined();
    });
  });

  describe('getAccessToken', () => {
    it('should return null when no tokens stored', () => {
      const token = service.getAccessToken();
      expect(token).toBeNull();
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return empty array when no accounts connected', () => {
      const accounts = service.getConnectedAccounts();
      expect(accounts).toEqual([]);
    });
  });

  describe('disconnect', () => {
    it('should clear tokens without error', () => {
      expect(() => service.disconnect()).not.toThrow();
    });
  });

  describe('getLinearOAuthService', () => {
    it('should return singleton instance', () => {
      const instance1 = getLinearOAuthService();
      const instance2 = getLinearOAuthService();

      expect(instance1).toBe(instance2);
    });
  });

  describe('resetLinearOAuthService', () => {
    it('should reset singleton instance', () => {
      const instance1 = getLinearOAuthService();
      resetLinearOAuthService();
      const instance2 = getLinearOAuthService();

      expect(instance1).not.toBe(instance2);
    });
  });
});
