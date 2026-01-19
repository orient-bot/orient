/**
 * Version Check Service Tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.hoisted to make mock variables available for hoisted vi.mock call
const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockReadFileSync: vi.fn().mockReturnValue(JSON.stringify({ name: 'orient', version: '1.0.0' })),
}));

// Mock fs module before importing the service
vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

// Import after mocking
import {
  VersionCheckService,
  createVersionCheckService,
  getVersionCheckService,
} from '../src/services/versionCheckService.js';

describe('VersionCheckService', () => {
  let service: VersionCheckService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up environment variables
    vi.stubEnv('VERSION_CHECK_ENDPOINT', 'https://example.com/version.json');
    vi.stubEnv('VERSION_CHECK_INTERVAL_HOURS', '6');
    // Reset fs mock to default
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'orient', version: '1.0.0' }));
    // Clear the singleton for fresh tests
    service = createVersionCheckService();
  });

  afterEach(() => {
    service.stopPolling();
    service.clearCache();
    vi.unstubAllEnvs();
  });

  describe('isEnabled', () => {
    it('should return true when endpoint is configured', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return the current version from package.json', () => {
      const version = service.getCurrentVersion();
      expect(version).toBe('1.0.0');
    });
  });

  describe('getStatus', () => {
    it('should return service status', () => {
      const status = service.getStatus();
      expect(status).toEqual({
        enabled: true,
        polling: false,
        endpoint: 'https://example.com/version.json',
        intervalHours: 6,
        currentVersion: '1.0.0',
      });
    });
  });

  describe('checkVersion', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should return error when endpoint is not configured', async () => {
      // Create a service without endpoint
      vi.stubEnv('VERSION_CHECK_ENDPOINT', '');
      const noEndpointService = createVersionCheckService();

      const result = await noEndpointService.checkVersion();
      expect(result.error).toBeDefined();
      expect(result.latestVersion).toBeNull();

      noEndpointService.stopPolling();
    });

    it('should fetch and compare versions successfully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            version: '1.1.0',
            changelogUrl: 'https://github.com/orient-bot/orient/releases',
          }),
      });

      const result = await service.checkVersion();

      expect(result.currentVersion).toBe('1.0.0');
      expect(result.latestVersion).toBe('1.1.0');
      expect(result.updateAvailable).toBe(true);
      expect(result.changelogUrl).toBe('https://github.com/orient-bot/orient/releases');
      expect(result.error).toBeUndefined();
    });

    it('should return updateAvailable=false when current is latest', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '1.0.0' }),
      });

      const result = await service.checkVersion();

      expect(result.updateAvailable).toBe(false);
    });

    it('should return updateAvailable=false when current is newer', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '0.9.0' }),
      });

      const result = await service.checkVersion();

      expect(result.updateAvailable).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const result = await service.checkVersion();

      expect(result.error).toBeDefined();
      expect(result.latestVersion).toBeNull();
      expect(result.updateAvailable).toBe(false);
    });

    it('should handle HTTP errors gracefully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await service.checkVersion();

      expect(result.error).toBeDefined();
      expect(result.latestVersion).toBeNull();
    });

    it('should cache results', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.1.0' }),
      });

      // First call
      await service.checkVersion();
      // Second call should use cache
      await service.checkVersion();

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache when forceRefresh=true', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.1.0' }),
      });

      // First call
      await service.checkVersion();
      // Second call with forceRefresh
      await service.checkVersion(true);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('polling', () => {
    it('should start polling when startPolling is called', () => {
      // Service should be enabled (endpoint configured in env)
      expect(service.isEnabled()).toBe(true);
      service.startPolling();
      expect(service.getStatus().polling).toBe(true);
    });

    it('should stop polling when stopPolling is called', () => {
      service.startPolling();
      service.stopPolling();
      expect(service.getStatus().polling).toBe(false);
    });

    it('should not start multiple pollers', () => {
      service.startPolling();
      service.startPolling();
      expect(service.getStatus().polling).toBe(true);
      service.stopPolling();
    });

    it('should not start polling when endpoint is not configured', () => {
      // Create a service without endpoint
      vi.stubEnv('VERSION_CHECK_ENDPOINT', '');
      const noEndpointService = createVersionCheckService();

      noEndpointService.startPolling();
      expect(noEndpointService.getStatus().polling).toBe(false);

      // Restore env for other tests
      vi.stubEnv('VERSION_CHECK_ENDPOINT', 'https://example.com/version.json');
      noEndpointService.stopPolling();
    });
  });
});

describe('Version comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERSION_CHECK_ENDPOINT', 'https://example.com/version.json');
    vi.stubEnv('VERSION_CHECK_INTERVAL_HOURS', '6');
    mockExistsSync.mockReturnValue(true);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const testCases = [
    { current: '1.0.0', latest: '1.0.1', expected: true, desc: 'patch update' },
    { current: '1.0.0', latest: '1.1.0', expected: true, desc: 'minor update' },
    { current: '1.0.0', latest: '2.0.0', expected: true, desc: 'major update' },
    { current: '1.0.0', latest: '1.0.0', expected: false, desc: 'same version' },
    { current: '1.0.1', latest: '1.0.0', expected: false, desc: 'downgrade' },
    { current: '2.0.0', latest: '1.9.9', expected: false, desc: 'major downgrade' },
    { current: '1.0.0', latest: '1.0.0-beta', expected: false, desc: 'prerelease is lower' },
    {
      current: '1.0.0-beta',
      latest: '1.0.0',
      expected: true,
      desc: 'release is higher than prerelease',
    },
  ];

  testCases.forEach(({ current, latest, expected, desc }) => {
    it(`should handle ${desc}: ${current} -> ${latest}`, async () => {
      // Mock package.json version - must be set BEFORE creating the service
      mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'orient', version: current }));

      const testService = createVersionCheckService();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: latest }),
      });

      const result = await testService.checkVersion();
      expect(result.updateAvailable).toBe(expected);

      testService.stopPolling();
      testService.clearCache();
    });
  });
});

describe('getVersionCheckService singleton', () => {
  it('should return the same instance', () => {
    const instance1 = getVersionCheckService();
    const instance2 = getVersionCheckService();
    expect(instance1).toBe(instance2);
  });
});
