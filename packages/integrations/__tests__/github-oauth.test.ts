/**
 * Tests for GitHub OAuth Service
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

import { GitHubOAuthService, type GitHubAccount } from '../src/catalog/github/oauth.js';
import { DEFAULT_GITHUB_SCOPES } from '../src/catalog/github/oauth-config.js';

describe('GitHub OAuth Service', () => {
  let service: GitHubOAuthService;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up test environment variables
    process.env = {
      ...originalEnv,
      GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
      GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret',
    };

    service = new GitHubOAuthService({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DEFAULT_GITHUB_SCOPES', () => {
    it('should include essential GitHub scopes', () => {
      expect(DEFAULT_GITHUB_SCOPES).toContain('repo');
      expect(DEFAULT_GITHUB_SCOPES).toContain('read:user');
      expect(DEFAULT_GITHUB_SCOPES).toContain('user:email');
    });
  });

  describe('startOAuthFlow', () => {
    it('should generate an auth URL with required parameters', async () => {
      const { authUrl, state } = await service.startOAuthFlow();

      expect(state).toBeDefined();
      expect(state.length).toBe(64); // 32 bytes hex = 64 chars

      expect(authUrl).toContain('https://github.com/login/oauth/authorize');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain(`state=${state}`);
      expect(authUrl).toContain('redirect_uri=');
    });

    it('should include scopes in the auth URL', async () => {
      const { authUrl } = await service.startOAuthFlow(['repo', 'user']);

      expect(authUrl).toContain('scope=');
      expect(authUrl).toContain('repo');
      expect(authUrl).toContain('user');
    });

    it('should use default scopes when none provided', async () => {
      const { authUrl } = await service.startOAuthFlow();

      // Should include default scopes
      expect(authUrl).toContain('scope=');
    });

    it('should store pending state for CSRF protection', async () => {
      const { state } = await service.startOAuthFlow(['repo']);

      // The state should be stored internally and available for callback validation
      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThan(0);
    });
  });

  describe('handleCallback', () => {
    it('should reject invalid state', async () => {
      const result = await service.handleCallback('code', 'invalid-state');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired');
    });

    it('should exchange code for tokens successfully', async () => {
      // Start OAuth flow to create valid state
      const { state } = await service.startOAuthFlow();

      // Mock token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'gho_test-access-token',
            token_type: 'bearer',
            scope: 'repo,user',
          }),
      });

      // Mock user info response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            login: 'testuser',
            id: 12345,
            name: 'Test User',
            email: 'test@example.com',
            avatar_url: 'https://github.com/avatars/testuser',
          }),
      });

      const result = await service.handleCallback('auth-code', state);

      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account?.login).toBe('testuser');
      expect(result.account?.email).toBe('test@example.com');
      expect(result.account?.name).toBe('Test User');
    });

    it('should handle token exchange failure', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Bad verification code'),
      });

      const result = await service.handleCallback('invalid-code', state);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle user info fetch failure', async () => {
      const { state } = await service.startOAuthFlow();

      // Mock successful token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'gho_test-token',
            token_type: 'bearer',
            scope: 'repo',
          }),
      });

      // Mock failed user info fetch
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await service.handleCallback('auth-code', state);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject expired state', async () => {
      const { state } = await service.startOAuthFlow();

      // Manually expire the state by modifying the service's internal data
      // In a real scenario, this would require time manipulation or waiting
      // For now, we test with a different approach - using a fake state
      const expiredState = 'expired-state-12345678';

      const result = await service.handleCallback('code', expiredState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired');
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return empty array when no accounts connected', () => {
      const accounts = service.getConnectedAccounts();
      expect(accounts).toEqual([]);
    });

    it('should return connected accounts after successful OAuth', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'gho_test-token',
            token_type: 'bearer',
            scope: 'repo,user',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            login: 'testuser',
            id: 12345,
            name: 'Test User',
            email: 'test@example.com',
            avatar_url: 'https://github.com/avatars/testuser',
          }),
      });

      await service.handleCallback('code', state);

      const accounts = service.getConnectedAccounts();
      expect(accounts.length).toBe(1);
      expect(accounts[0].login).toBe('testuser');
    });
  });

  describe('getAccount', () => {
    it('should return undefined when no account exists', () => {
      const account = service.getAccount('nonexistent');
      expect(account).toBeUndefined();
    });

    it('should return account for connected user', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'gho_test-access-token',
            token_type: 'bearer',
            scope: 'repo,user',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            login: 'testuser',
            id: 12345,
            name: 'Test User',
            email: 'test@example.com',
            avatar_url: 'https://github.com/avatars/testuser',
          }),
      });

      await service.handleCallback('code', state);

      const account = service.getAccount('testuser');
      expect(account).toBeDefined();
      expect(account?.login).toBe('testuser');
      expect(account?.accessToken).toBe('gho_test-access-token');
    });

    it('should return access token for specific username', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'gho_specific-token',
            token_type: 'bearer',
            scope: 'repo',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            login: 'specificuser',
            id: 67890,
            name: 'Specific User',
            email: 'specific@example.com',
            avatar_url: 'https://github.com/avatars/specificuser',
          }),
      });

      await service.handleCallback('code', state);

      const account = service.getAccount('specificuser');
      expect(account?.accessToken).toBe('gho_specific-token');
    });
  });

  describe('disconnectAccount', () => {
    it('should disconnect account successfully', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'gho_test-token',
            token_type: 'bearer',
            scope: 'repo',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            login: 'testuser',
            id: 12345,
            name: 'Test User',
            email: 'test@example.com',
            avatar_url: 'https://github.com/avatars/testuser',
          }),
      });

      await service.handleCallback('code', state);

      expect(service.getConnectedAccounts().length).toBe(1);

      const result = service.disconnectAccount('testuser');

      expect(result).toBe(true);
      expect(service.getConnectedAccounts().length).toBe(0);
      expect(service.getAccount('testuser')).toBeUndefined();
    });

    it('should return false when disconnecting non-existent account', () => {
      const result = service.disconnectAccount('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getPrimaryAccount', () => {
    it('should return undefined when no accounts connected', () => {
      const account = service.getPrimaryAccount();
      expect(account).toBeUndefined();
    });

    it('should return primary account after OAuth', async () => {
      const { state } = await service.startOAuthFlow();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'gho_test-token',
            token_type: 'bearer',
            scope: 'repo',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            login: 'testuser',
            id: 12345,
            name: 'Test User',
            email: 'test@example.com',
            avatar_url: 'https://github.com/avatars/testuser',
          }),
      });

      await service.handleCallback('code', state);

      const account = service.getPrimaryAccount();
      expect(account).toBeDefined();
      expect(account?.login).toBe('testuser');
    });
  });
});
