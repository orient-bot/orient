/**
 * Tests for AppsService - Permissions in App Listing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @orient-bot/core
vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
  getBuiltinAppsPath: vi.fn((projectRoot?: string) =>
    projectRoot ? `${projectRoot}/apps` : '/test/path/apps'
  ),
  getUserAppsPath: vi.fn(() => '/user/apps'),
}));

// Mock @orient-bot/apps
vi.mock('@orient-bot/apps', () => ({
  validateAppManifest: vi.fn((data) => ({
    valid: true,
    data: {
      name: data.name || 'test-app',
      title: data.title || 'Test App',
      description: data.description || 'Test description',
      version: data.version || '1.0.0',
      author: data.author,
      permissions: data.permissions || {},
      capabilities: data.capabilities || {},
      sharing: data.sharing || { mode: 'secret_link' },
      build: { output: 'dist' },
    },
  })),
}));

// Mock fs module
const mockFsExists = vi.fn();
const mockFsReaddir = vi.fn();
const mockFsReadFile = vi.fn();
const mockFsMkdir = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockFsExists(...args),
    readdirSync: (...args: unknown[]) => mockFsReaddir(...args),
    readFileSync: (...args: unknown[]) => mockFsReadFile(...args),
    mkdirSync: (...args: unknown[]) => mockFsMkdir(...args),
  },
  existsSync: (...args: unknown[]) => mockFsExists(...args),
  readdirSync: (...args: unknown[]) => mockFsReaddir(...args),
  readFileSync: (...args: unknown[]) => mockFsReadFile(...args),
  mkdirSync: (...args: unknown[]) => mockFsMkdir(...args),
}));

import { AppsService, AppSummary } from '../src/services/appsService.js';

describe('AppsService', () => {
  let appsService: AppsService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: apps directory exists
    mockFsExists.mockReturnValue(true);
    // Default: no apps
    mockFsReaddir.mockReturnValue([]);
  });

  describe('AppSummary interface', () => {
    it('should include optional permissions field', () => {
      const summary: AppSummary = {
        name: 'test-app',
        title: 'Test App',
        description: 'A test app',
        version: '1.0.0',
        status: 'draft',
        isBuilt: false,
        author: 'Test Author',
        source: 'builtin',
        permissions: {
          calendar: { read: true, write: false },
          slack: { read: true, write: true },
        },
      };

      expect(summary.permissions).toBeDefined();
      expect(summary.permissions?.calendar).toEqual({ read: true, write: false });
      expect(summary.permissions?.slack).toEqual({ read: true, write: true });
    });

    it('should allow permissions to be undefined', () => {
      const summary: AppSummary = {
        name: 'test-app',
        title: 'Test App',
        description: 'A test app',
        version: '1.0.0',
        status: 'draft',
        isBuilt: false,
        source: 'builtin',
      };

      expect(summary.permissions).toBeUndefined();
    });

    it('should include optional capabilities field', () => {
      const summary: AppSummary = {
        name: 'test-app',
        title: 'Test App',
        description: 'A test app',
        version: '1.0.0',
        status: 'draft',
        isBuilt: false,
        source: 'builtin',
        capabilities: {
          scheduler: { enabled: true },
          storage: { enabled: true },
        },
      };

      expect(summary.capabilities).toBeDefined();
      expect(summary.capabilities?.scheduler).toEqual({ enabled: true });
      expect(summary.capabilities?.storage).toEqual({ enabled: true });
      expect(summary.capabilities?.webhooks).toBeUndefined();
    });

    it('should allow capabilities to be undefined', () => {
      const summary: AppSummary = {
        name: 'test-app',
        title: 'Test App',
        description: 'A test app',
        version: '1.0.0',
        status: 'draft',
        isBuilt: false,
        source: 'builtin',
      };

      expect(summary.capabilities).toBeUndefined();
    });
  });

  describe('listApps', () => {
    it('should return empty array when not initialized', () => {
      appsService = new AppsService('/test/path');
      const result = appsService.listApps();
      expect(result).toEqual([]);
    });

    it('should return empty array when apps directory does not exist', async () => {
      mockFsExists.mockReturnValue(false);
      appsService = new AppsService('/test/path');
      await appsService.initialize();
      const result = appsService.listApps();
      expect(result).toEqual([]);
    });

    it('should include permissions in app summary when app has permissions', async () => {
      // Setup: one app with permissions
      mockFsReaddir.mockReturnValue([{ name: 'my-app', isDirectory: () => true }]);
      mockFsExists.mockImplementation((path: string) => {
        if (path.includes('APP.yaml')) return true;
        if (path.includes('dist')) return false;
        return true;
      });
      mockFsReadFile.mockReturnValue(`
name: my-app
title: My App
description: An app with permissions
version: 1.0.0
permissions:
  calendar:
    read: true
    write: false
  slack:
    read: true
    write: true
build:
  output: dist
`);

      appsService = new AppsService('/test/path');
      await appsService.initialize();
      const result = appsService.listApps();

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('my-app');
      expect(result[0].permissions).toBeDefined();
      expect(result[0].permissions?.calendar).toEqual({ read: true, write: false });
      expect(result[0].permissions?.slack).toEqual({ read: true, write: true });
    });

    it('should return undefined permissions when app has no permissions', async () => {
      // Setup: one app without permissions
      mockFsReaddir.mockReturnValue([{ name: 'simple-app', isDirectory: () => true }]);
      mockFsExists.mockImplementation((path: string) => {
        if (path.includes('APP.yaml')) return true;
        if (path.includes('dist')) return false;
        return true;
      });
      mockFsReadFile.mockReturnValue(`
name: simple-app
title: Simple App
description: An app without permissions
version: 1.0.0
permissions: {}
build:
  output: dist
`);

      appsService = new AppsService('/test/path');
      await appsService.initialize();
      const result = appsService.listApps();

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('simple-app');
      expect(result[0].permissions).toBeUndefined();
    });

    it('should exclude tools from permissions', async () => {
      // Setup: app with tools in permissions (should be excluded)
      mockFsReaddir.mockReturnValue([{ name: 'tool-app', isDirectory: () => true }]);
      mockFsExists.mockImplementation((path: string) => {
        if (path.includes('APP.yaml')) return true;
        if (path.includes('dist')) return false;
        return true;
      });
      mockFsReadFile.mockReturnValue(`
name: tool-app
title: Tool App
description: An app with tools permission
version: 1.0.0
permissions:
  tools: [search, calculate]
  calendar:
    read: true
    write: false
build:
  output: dist
`);

      appsService = new AppsService('/test/path');
      await appsService.initialize();
      const result = appsService.listApps();

      expect(result.length).toBe(1);
      expect(result[0].permissions).toBeDefined();
      // tools should be excluded
      expect(result[0].permissions?.tools).toBeUndefined();
      // calendar should be included
      expect(result[0].permissions?.calendar).toEqual({ read: true, write: false });
    });
  });
});
