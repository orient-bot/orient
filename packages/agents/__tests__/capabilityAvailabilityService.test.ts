import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the integration connection service
vi.mock('../src/services/integrationConnectionService.js', () => {
  return {
    IntegrationConnectionService: class {
      async isIntegrationConnected(name: string): Promise<boolean> {
        // Default: google connected, atlassian not connected
        if (name === 'google') return true;
        if (name === 'atlassian') return false;
        if (name === 'slack') return false;
        return false;
      }
    },
  };
});

// Mock @orient-bot/core
vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
  getRawConfig: vi.fn().mockReturnValue({}),
}));

import {
  CapabilityAvailabilityService,
  getCapabilityAvailabilityService,
  resetCapabilityAvailabilityService,
} from '../src/services/capabilityAvailabilityService.js';

describe('CapabilityAvailabilityService', () => {
  let service: CapabilityAvailabilityService;

  beforeEach(() => {
    resetCapabilityAvailabilityService();
    service = new CapabilityAvailabilityService();
    service.clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('areCapabilitiesAvailable', () => {
    it('returns true for undefined requirements (backward compatible)', async () => {
      const result = await service.areCapabilitiesAvailable(undefined);
      expect(result).toBe(true);
    });

    it('returns true for empty requirements array (backward compatible)', async () => {
      const result = await service.areCapabilitiesAvailable([]);
      expect(result).toBe(true);
    });

    it('returns true when single OAuth requirement is met', async () => {
      const result = await service.areCapabilitiesAvailable(['google-oauth']);
      expect(result).toBe(true);
    });

    it('returns false when single OAuth requirement is not met', async () => {
      const result = await service.areCapabilitiesAvailable(['atlassian-oauth']);
      expect(result).toBe(false);
    });

    it('returns false when any requirement is not met (partial)', async () => {
      // Google is connected, atlassian is not
      const result = await service.areCapabilitiesAvailable(['google-oauth', 'atlassian-oauth']);
      expect(result).toBe(false);
    });
  });

  describe('isCapabilityAvailable', () => {
    it('checks OAuth integration for *-oauth capabilities', async () => {
      const googleResult = await service.isCapabilityAvailable('google-oauth');
      expect(googleResult).toBe(true);

      const atlassianResult = await service.isCapabilityAvailable('atlassian-oauth');
      expect(atlassianResult).toBe(false);
    });

    it('maps jira to atlassian integration', async () => {
      const result = await service.isCapabilityAvailable('jira-oauth');
      expect(result).toBe(false); // atlassian not connected
    });

    it('maps confluence to atlassian integration', async () => {
      const result = await service.isCapabilityAvailable('confluence-oauth');
      expect(result).toBe(false); // atlassian not connected
    });

    it('returns false for unknown integrations', async () => {
      const result = await service.isCapabilityAvailable('unknown-oauth');
      expect(result).toBe(false);
    });

    it('caches results', async () => {
      // First call
      const result1 = await service.isCapabilityAvailable('google-oauth');
      expect(result1).toBe(true);

      // Second call should use cache (same result without new integration check)
      const result2 = await service.isCapabilityAvailable('google-oauth');
      expect(result2).toBe(true);
    });
  });

  describe('getCapabilityStatuses', () => {
    it('returns detailed status for multiple capabilities', async () => {
      const statuses = await service.getCapabilityStatuses(['google-oauth', 'atlassian-oauth']);

      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toEqual({
        name: 'google-oauth',
        type: 'oauth',
        available: true,
      });
      expect(statuses[1]).toEqual({
        name: 'atlassian-oauth',
        type: 'oauth',
        available: false,
      });
    });
  });

  describe('capability type parsing', () => {
    it('parses *-mcp as mcp type', async () => {
      const statuses = await service.getCapabilityStatuses(['atlassian-mcp']);
      expect(statuses[0].type).toBe('mcp');
    });

    it('parses *-oauth as oauth type', async () => {
      const statuses = await service.getCapabilityStatuses(['google-oauth']);
      expect(statuses[0].type).toBe('oauth');
    });

    it('parses *-config as config type', async () => {
      const statuses = await service.getCapabilityStatuses(['slack-config']);
      expect(statuses[0].type).toBe('config');
    });

    it('defaults to oauth type for unrecognized suffix', async () => {
      const statuses = await service.getCapabilityStatuses(['something-else']);
      expect(statuses[0].type).toBe('oauth');
    });
  });

  describe('clearCache', () => {
    it('clears the capability cache', async () => {
      // Populate cache
      await service.isCapabilityAvailable('google-oauth');

      // Clear it
      service.clearCache();

      // The service should re-check on next call
      // (we can't easily verify this without more detailed mocking,
      // but at least verify the method doesn't throw)
      const result = await service.isCapabilityAvailable('google-oauth');
      expect(result).toBe(true);
    });
  });
});

describe('getCapabilityAvailabilityService', () => {
  beforeEach(() => {
    resetCapabilityAvailabilityService();
  });

  it('returns a singleton instance', () => {
    const instance1 = getCapabilityAvailabilityService();
    const instance2 = getCapabilityAvailabilityService();
    expect(instance1).toBe(instance2);
  });

  it('creates new instance after reset', () => {
    const instance1 = getCapabilityAvailabilityService();
    resetCapabilityAvailabilityService();
    const instance2 = getCapabilityAvailabilityService();
    expect(instance1).not.toBe(instance2);
  });
});
