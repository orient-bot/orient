/**
 * Tests for Crypto Module
 *
 * CRITICAL SECURITY TESTS: These tests verify encryption/decryption security properties
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getMasterKey, encryptSecret, decryptSecret } from '../src/crypto.js';

describe('Crypto Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getMasterKey', () => {
    it('should throw in production without ORIENT_MASTER_KEY', () => {
      delete process.env.ORIENT_MASTER_KEY;
      process.env.NODE_ENV = 'production';

      expect(() => getMasterKey()).toThrow('ORIENT_MASTER_KEY must be at least 32 characters');
    });

    it('should throw in production with short ORIENT_MASTER_KEY', () => {
      process.env.ORIENT_MASTER_KEY = 'too-short';
      process.env.NODE_ENV = 'production';

      expect(() => getMasterKey()).toThrow('ORIENT_MASTER_KEY must be at least 32 characters');
    });

    it('should use dev key in development mode without ORIENT_MASTER_KEY', () => {
      delete process.env.ORIENT_MASTER_KEY;
      delete process.env.NODE_ENV;

      const key = getMasterKey();
      expect(key).toBeDefined();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should use dev key in test mode without ORIENT_MASTER_KEY', () => {
      delete process.env.ORIENT_MASTER_KEY;
      process.env.NODE_ENV = 'test';

      const key = getMasterKey();
      expect(key).toBeDefined();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should accept valid ORIENT_MASTER_KEY in production', () => {
      process.env.ORIENT_MASTER_KEY = 'a'.repeat(32);
      process.env.NODE_ENV = 'production';

      const key = getMasterKey();
      expect(key).toBeDefined();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should reject keys shorter than 32 characters', () => {
      process.env.ORIENT_MASTER_KEY = 'a'.repeat(31);
      process.env.NODE_ENV = 'production';

      expect(() => getMasterKey()).toThrow('ORIENT_MASTER_KEY must be at least 32 characters');
    });

    it('should derive same key from same input', () => {
      process.env.ORIENT_MASTER_KEY = 'test-master-key-with-at-least-32-characters';

      const key1 = getMasterKey();
      const key2 = getMasterKey();

      expect(key1.equals(key2)).toBe(true);
    });
  });

  describe('Round-trip encryption', () => {
    beforeEach(() => {
      // Use a consistent key for encryption tests
      process.env.ORIENT_MASTER_KEY = 'test-master-key-for-encryption-testing-32-chars';
    });

    it('should encrypt and decrypt successfully', () => {
      const plaintext = 'sensitive-secret-value';

      const { encrypted, iv, authTag } = encryptSecret(plaintext);
      const decrypted = decryptSecret(encrypted, iv, authTag);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different encrypted values for same plaintext', () => {
      const plaintext = 'test-secret';

      const result1 = encryptSecret(plaintext);
      const result2 = encryptSecret(plaintext);

      // Encrypted values should be different due to random IV
      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(result1.iv).not.toBe(result2.iv);

      // But both should decrypt to the same plaintext
      const decrypted1 = decryptSecret(result1.encrypted, result1.iv, result1.authTag);
      const decrypted2 = decryptSecret(result2.encrypted, result2.iv, result2.authTag);

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it('should produce different IVs for each encryption', () => {
      const plaintext = 'test-secret';
      const ivs = new Set<string>();

      // Encrypt multiple times
      for (let i = 0; i < 100; i++) {
        const { iv } = encryptSecret(plaintext);
        ivs.add(iv);
      }

      // All IVs should be unique
      expect(ivs.size).toBe(100);
    });

    it('should fail decryption with wrong IV', () => {
      const plaintext = 'test-secret';
      const { encrypted, authTag } = encryptSecret(plaintext);
      const wrongIv = encryptSecret('other').iv;

      expect(() => decryptSecret(encrypted, wrongIv, authTag)).toThrow();
    });

    it('should fail decryption with tampered authTag', () => {
      const plaintext = 'test-secret';
      const { encrypted, iv } = encryptSecret(plaintext);
      const wrongAuthTag = encryptSecret('other').authTag;

      expect(() => decryptSecret(encrypted, iv, wrongAuthTag)).toThrow();
    });

    it('should fail decryption with tampered ciphertext', () => {
      const plaintext = 'test-secret';
      const { encrypted, iv, authTag } = encryptSecret(plaintext);

      // Tamper with the encrypted data
      const tamperedEncrypted = encrypted.substring(0, encrypted.length - 2) + 'ff';

      expect(() => decryptSecret(tamperedEncrypted, iv, authTag)).toThrow();
    });

    it('should handle empty strings', () => {
      const plaintext = '';

      const { encrypted, iv, authTag } = encryptSecret(plaintext);
      const decrypted = decryptSecret(encrypted, iv, authTag);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '🔐 Secret émoji 密码 тест';

      const { encrypted, iv, authTag } = encryptSecret(plaintext);
      const decrypted = decryptSecret(encrypted, iv, authTag);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);

      const { encrypted, iv, authTag } = encryptSecret(plaintext);
      const decrypted = decryptSecret(encrypted, iv, authTag);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters and newlines', () => {
      const plaintext = 'Line 1\nLine 2\tTab\r\nWindows\\Path/Unix';

      const { encrypted, iv, authTag } = encryptSecret(plaintext);
      const decrypted = decryptSecret(encrypted, iv, authTag);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce hex-encoded outputs', () => {
      const plaintext = 'test-secret';

      const { encrypted, iv, authTag } = encryptSecret(plaintext);

      // Check that outputs are valid hex strings
      expect(encrypted).toMatch(/^[0-9a-f]+$/);
      expect(iv).toMatch(/^[0-9a-f]+$/);
      expect(authTag).toMatch(/^[0-9a-f]+$/);

      // Check expected lengths (IV should be 16 bytes = 32 hex chars)
      expect(iv.length).toBe(32);
      // Auth tag should be 16 bytes = 32 hex chars for GCM
      expect(authTag.length).toBe(32);
    });
  });

  describe('Security properties', () => {
    beforeEach(() => {
      process.env.ORIENT_MASTER_KEY = 'test-master-key-for-security-testing-32-chars';
    });

    it('should not expose plaintext in encrypted output', () => {
      const plaintext = 'my-secret-password';

      const { encrypted } = encryptSecret(plaintext);

      // Encrypted output should not contain the plaintext
      expect(encrypted).not.toContain(plaintext);
      expect(encrypted.toLowerCase()).not.toContain(plaintext.toLowerCase());
    });

    it('should use different keys for different ORIENT_MASTER_KEY values', () => {
      const plaintext = 'test-secret';

      // Encrypt with first key
      process.env.ORIENT_MASTER_KEY = 'first-master-key-with-32-characters-here';
      const { encrypted: encrypted1, iv, authTag } = encryptSecret(plaintext);

      // Try to decrypt with different key
      process.env.ORIENT_MASTER_KEY = 'second-master-key-with-32-characters-here';

      expect(() => decryptSecret(encrypted1, iv, authTag)).toThrow();
    });

    it('should require all three components for decryption', () => {
      const plaintext = 'test-secret';
      const { encrypted, iv, authTag } = encryptSecret(plaintext);

      // Missing any component should fail type-checking, but test runtime behavior
      expect(() => decryptSecret(encrypted, iv, '')).toThrow();
      expect(() => decryptSecret(encrypted, '', authTag)).toThrow();
      expect(() => decryptSecret('', iv, authTag)).toThrow();
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      process.env.ORIENT_MASTER_KEY = 'test-master-key-for-error-testing-32-chars';
    });

    it('should throw on invalid hex in IV', () => {
      const { encrypted, authTag } = encryptSecret('test');

      expect(() => decryptSecret(encrypted, 'invalid-hex', authTag)).toThrow();
    });

    it('should throw on invalid hex in authTag', () => {
      const { encrypted, iv } = encryptSecret('test');

      expect(() => decryptSecret(encrypted, iv, 'invalid-hex')).toThrow();
    });

    it('should throw on invalid hex in encrypted data', () => {
      const { iv, authTag } = encryptSecret('test');

      expect(() => decryptSecret('invalid-hex', iv, authTag)).toThrow();
    });

    it('should throw on wrong length IV', () => {
      const { encrypted, authTag } = encryptSecret('test');
      const shortIv = 'abcd';

      expect(() => decryptSecret(encrypted, shortIv, authTag)).toThrow();
    });

    it('should throw on wrong length authTag', () => {
      const { encrypted, iv } = encryptSecret('test');
      const shortAuthTag = 'abcd';

      expect(() => decryptSecret(encrypted, iv, shortAuthTag)).toThrow();
    });
  });
});
