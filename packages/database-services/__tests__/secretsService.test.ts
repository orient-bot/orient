/**
 * Tests for Secrets Service
 *
 * CRITICAL SECURITY TESTS: These tests verify secret encryption, storage, and retrieval
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Mock crypto functions
vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
  encryptSecret: vi.fn(),
  decryptSecret: vi.fn(),
}));

import { SecretsService } from '../src/secretsService.js';
import { encryptSecret, decryptSecret } from '@orient/core';

const mockEncryptSecret = vi.mocked(encryptSecret);
const mockDecryptSecret = vi.mocked(decryptSecret);

describe('SecretsService', () => {
  let service: SecretsService;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    // Reset mock implementations
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    // Default mock implementations
    mockEncryptSecret.mockReturnValue({
      encrypted: 'encrypted-value',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    });
    mockDecryptSecret.mockReturnValue('decrypted-value');

    service = new SecretsService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSecret', () => {
    it('should retrieve and decrypt secret', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            encrypted_value: 'encrypted-data',
            iv: 'some-iv',
            auth_tag: 'some-tag',
          },
        ],
        rowCount: 1,
      });

      mockDecryptSecret.mockReturnValueOnce('my-secret-value');

      const result = await service.getSecret('test-key');

      expect(result).toBe('my-secret-value');
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT encrypted_value, iv, auth_tag FROM secrets WHERE key = $1',
        ['test-key']
      );
      expect(mockDecryptSecret).toHaveBeenCalledWith('encrypted-data', 'some-iv', 'some-tag');
    });

    it('should return null for non-existent secrets', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getSecret('non-existent-key');

      expect(result).toBeNull();
    });

    it('should handle decryption failures', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            encrypted_value: 'encrypted-data',
            iv: 'some-iv',
            auth_tag: 'some-tag',
          },
        ],
        rowCount: 1,
      });

      mockDecryptSecret.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(service.getSecret('test-key')).rejects.toThrow('Decryption failed');
    });
  });

  describe('setSecret', () => {
    it('should encrypt and store secret', async () => {
      mockEncryptSecret.mockReturnValueOnce({
        encrypted: 'encrypted-value',
        iv: 'test-iv',
        authTag: 'test-auth-tag',
      });

      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.setSecret('test-key', 'test-value');

      expect(mockEncryptSecret).toHaveBeenCalledWith('test-value');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO secrets'), [
        'test-key',
        'encrypted-value',
        'test-iv',
        'test-auth-tag',
        null,
        null,
      ]);
    });

    it('should create audit log entry', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.setSecret('test-key', 'test-value', { changedBy: 'admin' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO secrets_audit_log'),
        ['test-key', 'updated', 'admin']
      );
    });

    it('should upsert existing secrets', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.setSecret('existing-key', 'new-value');

      const insertCall = mockQuery.mock.calls[0];
      expect(insertCall[0]).toContain('ON CONFLICT (key)');
      expect(insertCall[0]).toContain('DO UPDATE SET');
    });

    it('should handle category and description', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.setSecret('test-key', 'test-value', {
        category: 'oauth',
        description: 'OAuth token',
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO secrets'), [
        'test-key',
        'encrypted-value',
        'test-iv',
        'test-auth-tag',
        'oauth',
        'OAuth token',
      ]);
    });

    it('should handle database connection failures', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(service.setSecret('test-key', 'test-value')).rejects.toThrow(
        'Connection refused'
      );
    });
  });

  describe('deleteSecret', () => {
    it('should delete secret', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.deleteSecret('test-key');

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM secrets WHERE key = $1', ['test-key']);
    });

    it('should log deletion in audit log', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.deleteSecret('test-key', 'admin');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO secrets_audit_log'),
        ['test-key', 'deleted', 'admin']
      );
    });
  });

  describe('listSecrets', () => {
    it('should return secret metadata', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            key: 'key1',
            category: 'oauth',
            description: 'Test secret',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
          {
            key: 'key2',
            category: null,
            description: null,
            created_at: '2024-01-03T00:00:00Z',
            updated_at: '2024-01-04T00:00:00Z',
          },
        ],
        rowCount: 2,
      });

      const result = await service.listSecrets();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        key: 'key1',
        category: 'oauth',
        description: 'Test secret',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      });
      expect(result[1].category).toBeNull();
    });

    it('should return empty array when no secrets exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.listSecrets();

      expect(result).toEqual([]);
    });
  });

  describe('getSecretsByCategory', () => {
    it('should filter secrets by category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            key: 'oauth-key1',
            encrypted_value: 'enc1',
            iv: 'iv1',
            auth_tag: 'tag1',
          },
          {
            key: 'oauth-key2',
            encrypted_value: 'enc2',
            iv: 'iv2',
            auth_tag: 'tag2',
          },
        ],
        rowCount: 2,
      });

      mockDecryptSecret.mockReturnValueOnce('value1').mockReturnValueOnce('value2');

      const result = await service.getSecretsByCategory('oauth');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE category = $1'), [
        'oauth',
      ]);
      expect(result).toEqual({
        'oauth-key1': 'value1',
        'oauth-key2': 'value2',
      });
    });

    it('should return empty object when no secrets in category', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getSecretsByCategory('nonexistent');

      expect(result).toEqual({});
    });

    it('should decrypt all secrets in category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            key: 'key1',
            encrypted_value: 'enc1',
            iv: 'iv1',
            auth_tag: 'tag1',
          },
        ],
        rowCount: 1,
      });

      mockDecryptSecret.mockReturnValueOnce('decrypted-value');

      await service.getSecretsByCategory('test');

      expect(mockDecryptSecret).toHaveBeenCalledWith('enc1', 'iv1', 'tag1');
    });
  });

  describe('getAllSecrets', () => {
    it('should return all secrets as decrypted key-value pairs', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            key: 'key1',
            encrypted_value: 'enc1',
            iv: 'iv1',
            auth_tag: 'tag1',
          },
          {
            key: 'key2',
            encrypted_value: 'enc2',
            iv: 'iv2',
            auth_tag: 'tag2',
          },
        ],
        rowCount: 2,
      });

      mockDecryptSecret.mockReturnValueOnce('value1').mockReturnValueOnce('value2');

      const result = await service.getAllSecrets();

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
      expect(mockDecryptSecret).toHaveBeenCalledTimes(2);
    });

    it('should return empty object when no secrets exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getAllSecrets();

      expect(result).toEqual({});
    });
  });

  describe('Error handling', () => {
    it('should handle database query failures gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.getSecret('test-key')).rejects.toThrow('Database error');
    });

    it('should propagate encryption errors', async () => {
      mockEncryptSecret.mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      await expect(service.setSecret('test-key', 'test-value')).rejects.toThrow(
        'Encryption failed'
      );
    });
  });

  describe('Constructor', () => {
    it('should use provided connection string', () => {
      const customService = new SecretsService('postgresql://custom:custom@localhost:5432/custom');

      expect(customService).toBeDefined();
    });

    it('should use DATABASE_URL environment variable', () => {
      process.env.DATABASE_URL = 'postgresql://env:env@localhost:5432/env';
      const envService = new SecretsService();

      expect(envService).toBeDefined();
    });

    it('should use default connection string when none provided', () => {
      delete process.env.DATABASE_URL;
      const defaultService = new SecretsService();

      expect(defaultService).toBeDefined();
    });
  });
});
