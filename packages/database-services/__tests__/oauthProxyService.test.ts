/**
 * Tests for OAuth Proxy Service
 *
 * Tests session management, token encryption, and PKCE validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Create module-level mocks
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

// Mock pg module
vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
      connect = mockPool.connect;
      end = mockPool.end;
      on = mockPool.on;
      removeListener = mockPool.removeListener;
    },
  },
}));

// Mock crypto functions from @orient/core
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
  encryptSecret: vi.fn(),
  decryptSecret: vi.fn(),
}));

import { OAuthProxyService } from '../src/oauthProxyService.js';
import { encryptSecret, decryptSecret } from '@orient/core';

const mockEncryptSecret = vi.mocked(encryptSecret);
const mockDecryptSecret = vi.mocked(decryptSecret);

describe('OAuthProxyService', () => {
  let service: OAuthProxyService;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    mockEncryptSecret.mockReturnValue({
      encrypted: 'encrypted-tokens',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    });
    mockDecryptSecret.mockReturnValue(
      JSON.stringify({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        scopes: ['email', 'profile'],
        email: 'test@example.com',
      })
    );

    service = new OAuthProxyService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createSession', () => {
    it('should create a new pending session', async () => {
      const mockRow = {
        id: 1,
        session_id: 'test-session-id',
        code_challenge: 'test-challenge',
        scopes: ['email', 'profile'],
        status: 'pending',
        user_email: null,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 300000),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const session = await service.createSession({
        sessionId: 'test-session-id',
        codeChallenge: 'test-challenge',
        scopes: ['email', 'profile'],
      });

      expect(session.sessionId).toBe('test-session-id');
      expect(session.status).toBe('pending');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO oauth_proxy_sessions'),
        expect.arrayContaining(['test-session-id', 'test-challenge', ['email', 'profile']])
      );
    });

    it('should set expiration to 5 minutes from now', async () => {
      const before = Date.now();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            session_id: 'test-session-id',
            code_challenge: 'test-challenge',
            scopes: ['email'],
            status: 'pending',
            user_email: null,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 300000),
          },
        ],
        rowCount: 1,
      });

      await service.createSession({
        sessionId: 'test-session-id',
        codeChallenge: 'test-challenge',
        scopes: ['email'],
      });

      const after = Date.now();
      const insertCall = mockQuery.mock.calls[0];
      const expiresAt = insertCall[1][3] as Date;

      // Expiration should be ~5 minutes (300000ms) from now
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300000 - 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 300000 + 1000);
    });
  });

  describe('getSession', () => {
    it('should retrieve session by ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            session_id: 'test-session-id',
            code_challenge: 'test-challenge',
            scopes: ['email', 'profile'],
            status: 'pending',
            user_email: null,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 300000),
          },
        ],
        rowCount: 1,
      });

      const session = await service.getSession('test-session-id');

      expect(session).not.toBeNull();
      expect(session?.sessionId).toBe('test-session-id');
      expect(session?.status).toBe('pending');
    });

    it('should return null for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const session = await service.getSession('non-existent');

      expect(session).toBeNull();
    });
  });

  describe('completeSession', () => {
    it('should encrypt and store tokens', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

      const tokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        scopes: ['email', 'profile'],
        email: 'test@example.com',
      };

      const result = await service.completeSession({
        sessionId: 'test-session-id',
        tokens,
      });

      expect(result).toBe(true);
      expect(mockEncryptSecret).toHaveBeenCalledWith(JSON.stringify(tokens));
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'completed'"),
        expect.arrayContaining(['test-session-id', expect.any(String), 'test@example.com'])
      );
    });

    it('should return false if session not found or expired', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.completeSession({
        sessionId: 'non-existent',
        tokens: {
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresAt: Date.now(),
          scopes: [],
          email: 'test@example.com',
        },
      });

      expect(result).toBe(false);
    });
  });

  describe('getTokens', () => {
    it('should validate PKCE and return decrypted tokens', async () => {
      // Generate a real code verifier and challenge for testing
      const codeVerifier = 'test-code-verifier-12345678901234567890';
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      const encryptedData = JSON.stringify({
        encrypted: 'enc-data',
        iv: 'iv',
        authTag: 'tag',
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            code_challenge: codeChallenge,
            encrypted_tokens: encryptedData,
            status: 'completed',
            expires_at: new Date(Date.now() + 300000),
          },
        ],
        rowCount: 1,
      });

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // For the UPDATE

      const tokens = await service.getTokens('test-session-id', codeVerifier);

      expect(tokens).not.toBeNull();
      expect(tokens?.email).toBe('test@example.com');
      expect(mockDecryptSecret).toHaveBeenCalled();
    });

    it('should reject invalid PKCE verifier', async () => {
      const codeVerifier = 'correct-verifier';
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            code_challenge: codeChallenge,
            encrypted_tokens: '{}',
            status: 'completed',
            expires_at: new Date(Date.now() + 300000),
          },
        ],
        rowCount: 1,
      });

      const tokens = await service.getTokens('test-session-id', 'wrong-verifier');

      expect(tokens).toBeNull();
    });

    it('should return null for pending session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            code_challenge: 'challenge',
            encrypted_tokens: null,
            status: 'pending',
            expires_at: new Date(Date.now() + 300000),
          },
        ],
        rowCount: 1,
      });

      const tokens = await service.getTokens('test-session-id', 'verifier');

      expect(tokens).toBeNull();
    });

    it('should return null for expired session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            code_challenge: 'challenge',
            encrypted_tokens: '{}',
            status: 'completed',
            expires_at: new Date(Date.now() - 1000), // Expired
          },
        ],
        rowCount: 1,
      });

      const tokens = await service.getTokens('test-session-id', 'verifier');

      expect(tokens).toBeNull();
    });

    it('should mark session as retrieved after successful retrieval', async () => {
      const codeVerifier = 'test-verifier';
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      const encryptedData = JSON.stringify({
        encrypted: 'enc-data',
        iv: 'iv',
        authTag: 'tag',
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            code_challenge: codeChallenge,
            encrypted_tokens: encryptedData,
            status: 'completed',
            expires_at: new Date(Date.now() + 300000),
          },
        ],
        rowCount: 1,
      });

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.getTokens('test-session-id', codeVerifier);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'retrieved'"), [
        'test-session-id',
      ]);
    });
  });

  describe('isSessionCompleted', () => {
    it('should return true for completed session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ status: 'completed' }],
        rowCount: 1,
      });

      const result = await service.isSessionCompleted('test-session-id');

      expect(result).toBe(true);
    });

    it('should return false for pending session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ status: 'pending' }],
        rowCount: 1,
      });

      const result = await service.isSessionCompleted('test-session-id');

      expect(result).toBe(false);
    });

    it('should return false for non-existent session', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.isSessionCompleted('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('cleanupExpired', () => {
    it('should delete expired and retrieved sessions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
        rowCount: 3,
      });

      const count = await service.cleanupExpired();

      expect(count).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("expires_at < NOW() OR status = 'retrieved'")
      );
    });

    it('should return 0 when no sessions to clean', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const count = await service.cleanupExpired();

      expect(count).toBe(0);
    });
  });

  describe('expireSession', () => {
    it('should mark session as expired', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.expireSession('test-session-id');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'expired'"), [
        'test-session-id',
      ]);
    });
  });
});
