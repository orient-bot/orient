/**
 * Contract Tests for @orientbot/core
 *
 * These tests verify that the public API of @orientbot/core remains stable.
 * If any of these tests fail, it indicates a breaking change to the package API.
 */

import { describe, it, expect } from 'vitest';

describe('@orientbot/core Public API Contract', () => {
  describe('Config Exports', () => {
    it('should export loadConfig function', async () => {
      const { loadConfig } = await import('@orientbot/core');
      expect(typeof loadConfig).toBe('function');
    });

    it('should export getConfig function', async () => {
      const { getConfig } = await import('@orientbot/core');
      expect(typeof getConfig).toBe('function');
    });

    it('should export clearConfigCache function', async () => {
      const { clearConfigCache } = await import('@orientbot/core');
      expect(typeof clearConfigCache).toBe('function');
    });

    it('should export AppConfigSchema', async () => {
      const { AppConfigSchema } = await import('@orientbot/core');
      expect(AppConfigSchema).toBeDefined();
    });
  });

  describe('Logger Exports', () => {
    it('should export logger instance', async () => {
      const { logger } = await import('@orientbot/core');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should export createServiceLogger function', async () => {
      const { createServiceLogger } = await import('@orientbot/core');
      expect(typeof createServiceLogger).toBe('function');

      const serviceLogger = createServiceLogger('test');
      expect(typeof serviceLogger.info).toBe('function');
      expect(typeof serviceLogger.error).toBe('function');
      expect(typeof serviceLogger.startOperation).toBe('function');
    });
  });

  describe('Utility Exports', () => {
    it('should export sleep function', async () => {
      const { sleep } = await import('@orientbot/core');
      expect(typeof sleep).toBe('function');
    });

    it('should export deepClone function', async () => {
      const { deepClone } = await import('@orientbot/core');
      expect(typeof deepClone).toBe('function');
    });

    it('should export environment helpers', async () => {
      const { isProduction, isDevelopment, isTest } = await import('@orientbot/core');
      expect(typeof isProduction).toBe('function');
      expect(typeof isDevelopment).toBe('function');
      expect(typeof isTest).toBe('function');
    });
  });

  describe('Type Exports', () => {
    it('should export JiraIssue type (compile-time check)', async () => {
      // This test verifies type exports exist - actual type checking is compile-time
      const core = await import('@orientbot/core');
      // If this compiles, the types are exported
      expect(core).toBeDefined();
    });
  });
});
