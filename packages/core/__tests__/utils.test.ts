/**
 * Utility Functions Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Utility Functions', () => {
  describe('deepClone', () => {
    it('should deep clone an object', async () => {
      const { deepClone } = await import('../src/utils/index.js');
      
      const original = {
        name: 'test',
        nested: {
          value: 42,
          array: [1, 2, 3],
        },
      };
      
      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.nested).not.toBe(original.nested);
      expect(cloned.nested.array).not.toBe(original.nested.array);
    });

    it('should handle null and primitives', async () => {
      const { deepClone } = await import('../src/utils/index.js');
      
      expect(deepClone(null)).toBe(null);
      expect(deepClone(42)).toBe(42);
      expect(deepClone('test')).toBe('test');
      expect(deepClone(true)).toBe(true);
    });
  });

  describe('sleep', () => {
    it('should wait for specified duration', async () => {
      const { sleep } = await import('../src/utils/index.js');
      
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', async () => {
      const { truncate } = await import('../src/utils/index.js');
      
      const long = 'This is a very long string that should be truncated';
      const result = truncate(long, 20);
      
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should not truncate short strings', async () => {
      const { truncate } = await import('../src/utils/index.js');
      
      const short = 'Short';
      const result = truncate(short, 20);
      
      expect(result).toBe(short);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', async () => {
      const { formatBytes } = await import('../src/utils/index.js');
      
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });

  describe('formatDuration', () => {
    it('should format durations correctly', async () => {
      const { formatDuration } = await import('../src/utils/index.js');
      
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(3665000)).toBe('1h 1m');
    });
  });

  describe('environment helpers', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should detect test environment', async () => {
      const { isTest, isProduction, isDevelopment } = await import('../src/utils/index.js');
      
      expect(isTest()).toBe(true);
      expect(isProduction()).toBe(false);
    });

    it('should get environment variables with fallback', async () => {
      const { getEnv } = await import('../src/utils/index.js');
      
      vi.stubEnv('TEST_VAR', 'test_value');
      
      expect(getEnv('TEST_VAR')).toBe('test_value');
      expect(getEnv('NON_EXISTENT')).toBeUndefined();
      expect(getEnv('NON_EXISTENT', 'fallback')).toBe('fallback');
    });

    it('should throw for missing required env', async () => {
      const { requireEnv } = await import('../src/utils/index.js');
      
      expect(() => requireEnv('DEFINITELY_NOT_SET')).toThrow('Missing required environment variable');
    });
  });

  describe('isPlainObject', () => {
    it('should correctly identify plain objects', async () => {
      const { isPlainObject } = await import('../src/utils/index.js');
      
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ key: 'value' })).toBe(true);
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(42)).toBe(false);
    });
  });
});
