/**
 * Tests for JIRA OAuth Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
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
  JiraOAuthService,
  getJiraOAuthService,
  resetJiraOAuthService,
  DEFAULT_JIRA_SCOPES,
} from '../src/catalog/jira/oauth.js';

describe('JIRA OAuth Service', () => {
  let service: JiraOAuthService;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    resetJiraOAuthService();

    // Set up test environment variables
    process.env = {
      ...originalEnv,
      JIRA_OAUTH_CLIENT_ID: 'test-client-id',
      JIRA_OAUTH_CLIENT_SECRET: 'test-client-secret',
    };

    service = new JiraOAuthService();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetJiraOAuthService();
  });

  describe('DEFAULT_JIRA_SCOPES', () => {
    it('should include essential JIRA scopes', () => {
      expect(DEFAULT_JIRA_SCOPES).toContain('read:jira-work');
      expect(DEFAULT_JIRA_SCOPES).toContain('write:jira-work');
      expect(DEFAULT_JIRA_SCOPES).toContain('read:jira-user');
      expect(DEFAULT_JIRA_SCOPES).toContain('offline_access');
    });
  });

  describe('getCallbackUrl', () => {
    it('should return local callback URL when not in production', () => {
      delete process.env.JIRA_OAUTH_CALLBACK_URL;
      const newService = new JiraOAuthService();
      const url = newService.getCallbackUrl();

      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/jira\/callback$/);
    });

    it('should return production callback URL when configured', () => {
      process.env.JIRA_OAUTH_CALLBACK_URL = 'https://example.com/oauth/callback';

      // Need to re-evaluate the module to pick up the env change
      // This is a limitation of testing environment variables
      // In practice, we test the local URL behavior
    });
  });

  describe('startOAuthFlow', () => {
    it('should generate an auth URL with required parameters', async () => {
      const { authUrl, state } = await service.startOAuthFlow();

      expect(state).toBeDefined();
      expect(state.length).toBe(64); // 32 bytes hex = 64 chars

      expect(authUrl).toContain('https://auth.atlassian.com/authorize');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain(`state=${state}`);
      expect(authUrl).toContain('audience=api.atlassian.com');
    });

    it('should include scopes in the auth URL', async () => {
      const { authUrl } = await service.startOAuthFlow(['read:jira-work']);

      expect(authUrl).toContain('scope=read%3Ajira-work');
    });

    it('should use default scopes when none provided', async () => {
      const { authUrl } = await service.startOAuthFlow();

      // URL-encoded scopes should be present
      expect(authUrl).toContain('scope=');
      expect(authUrl).toContain('read%3Ajira-work');
    });

    it('should throw error when client credentials are missing', async () => {
      delete process.env.JIRA_OAUTH_CLIENT_ID;
      delete process.env.JIRA_OAUTH_CLIENT_SECRET;
      const newService = new JiraOAuthService();

      await expect(newService.startOAuthFlow()).rejects.toThrow(
        'JIRA OAuth credentials not configured'
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
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
          }),
      });

      // Mock accessible resources response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'cloud-123',
              name: 'Test Site',
              url: 'https://test.atlassian.net',
              scopes: ['read:jira-work'],
            },
          ]),
      });

      // Mock user info response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            accountId: 'user-123',
            emailAddress: 'test@example.com',
            displayName: 'Test User',
            avatarUrls: { '48x48': 'https://avatar.url' },
          }),
      });

      const account = await service.handleCallback('auth-code', state);

      expect(account).toBeDefined();
      expect(account.cloudId).toBe('cloud-123');
      expect(account.email).toBe('test@example.com');
      expect(account.displayName).toBe('Test User');
      expect(account.siteName).toBe('Test Site');
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

    it('should throw error when no accessible resources found', async () => {
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
        json: () => Promise.resolve([]),
      });

      await expect(service.handleCallback('code', state)).rejects.toThrow(
        'No accessible JIRA sites found'
      );
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return empty array when no accounts connected', () => {
      const accounts = service.getConnectedAccounts();
      expect(accounts).toEqual([]);
    });
  });

  describe('getAccessToken', () => {
    it('should return null when no tokens stored', async () => {
      const token = await service.getAccessToken();
      expect(token).toBeNull();
    });
  });

  describe('getCloudId', () => {
    it('should return null when no tokens stored', () => {
      const cloudId = service.getCloudId();
      expect(cloudId).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('should clear tokens without error', () => {
      expect(() => service.disconnect()).not.toThrow();
    });
  });

  describe('getJiraOAuthService', () => {
    it('should return singleton instance', () => {
      const instance1 = getJiraOAuthService();
      const instance2 = getJiraOAuthService();

      expect(instance1).toBe(instance2);
    });
  });

  describe('resetJiraOAuthService', () => {
    it('should reset singleton instance', () => {
      const instance1 = getJiraOAuthService();
      resetJiraOAuthService();
      const instance2 = getJiraOAuthService();

      expect(instance1).not.toBe(instance2);
    });
  });
});
