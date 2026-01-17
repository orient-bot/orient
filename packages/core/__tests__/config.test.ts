/**
 * Configuration Module Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock environment before importing config
vi.stubEnv('NODE_ENV', 'test');

describe('Configuration Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Schema Validation', () => {
    it('should export OrganizationSchema', async () => {
      const { OrganizationSchema } = await import('../src/config/schema.js');
      expect(OrganizationSchema).toBeDefined();
    });

    it('should validate organization config', async () => {
      const { OrganizationSchema } = await import('../src/config/schema.js');
      
      const validOrg = {
        name: 'Test Organization',
        jiraProjectKey: 'TEST',
        jiraComponent: 'TestComponent',
      };
      
      const result = OrganizationSchema.safeParse(validOrg);
      expect(result.success).toBe(true);
    });

    it('should reject invalid organization config', async () => {
      const { OrganizationSchema } = await import('../src/config/schema.js');
      
      const invalidOrg = {
        name: '', // Empty name should fail
        jiraProjectKey: 'TEST',
      };
      
      const result = OrganizationSchema.safeParse(invalidOrg);
      expect(result.success).toBe(false);
    });
  });

  describe('Defaults', () => {
    it('should export DEFAULT_SLA_THRESHOLDS', async () => {
      const { DEFAULT_SLA_THRESHOLDS } = await import('../src/config/defaults.js');
      expect(DEFAULT_SLA_THRESHOLDS).toBeDefined();
      expect(Array.isArray(DEFAULT_SLA_THRESHOLDS)).toBe(true);
      expect(DEFAULT_SLA_THRESHOLDS.length).toBeGreaterThan(0);
    });

    it('should export DEFAULT_FEATURES', async () => {
      const { DEFAULT_FEATURES } = await import('../src/config/defaults.js');
      expect(DEFAULT_FEATURES).toBeDefined();
      expect(DEFAULT_FEATURES.slaMonitoring).toBe(true);
      expect(DEFAULT_FEATURES.whatsappBot).toBe(false);
    });

    it('should merge with defaults correctly', async () => {
      const { mergeWithDefaults, DEFAULT_FEATURES } = await import('../src/config/defaults.js');
      
      const partial = {
        features: {
          whatsappBot: true,
        },
      };
      
      const merged = mergeWithDefaults(partial);
      expect(merged.features?.whatsappBot).toBe(true);
      expect(merged.features?.slaMonitoring).toBe(DEFAULT_FEATURES.slaMonitoring);
    });
  });
});
