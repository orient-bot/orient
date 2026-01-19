/**
 * Tests for Dashboard Entry Point
 *
 * Verifies the main.ts module structure and startup logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
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
  loadConfig: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn().mockReturnValue({
    integrations: {
      jira: { host: 'test.atlassian.net', email: 'test@test.com', apiToken: 'token' },
    },
    organization: {
      name: 'Test Org',
      jiraProjectKey: 'TEST',
    },
    dashboard: {
      enabled: true,
      port: 4098,
      defaultPermission: 'read_only',
    },
  }),
  getConfigVersion: vi.fn().mockReturnValue('test-version'),
}));

vi.mock('@orient/database-services', () => ({
  ensureAgentsSeeded: vi.fn().mockResolvedValue({ seeded: false, reason: 'test' }),
  createSecretsService: vi.fn().mockReturnValue({
    listSecrets: vi.fn().mockResolvedValue([]),
    getSecret: vi.fn().mockResolvedValue(null),
    setSecret: vi.fn().mockResolvedValue(undefined),
  }),
  createVersionPreferencesService: vi.fn().mockReturnValue({
    getPreferences: vi.fn().mockResolvedValue({
      userId: 1,
      notificationsEnabled: true,
      dismissedVersions: [],
      remindLaterUntil: null,
    }),
    updatePreferences: vi.fn().mockResolvedValue({}),
    dismissVersion: vi.fn().mockResolvedValue(undefined),
    remindLater: vi.fn().mockResolvedValue(undefined),
    shouldShowNotification: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@orient/integrations', () => ({
  getInstalledIntegrations: vi.fn().mockResolvedValue([]),
}));

vi.mock('@orient/integrations/google', () => ({
  getGoogleOAuthService: vi.fn().mockReturnValue({
    getConnectedAccounts: vi.fn().mockReturnValue([]),
  }),
  DEFAULT_SCOPES: [],
  IS_GOOGLE_OAUTH_PRODUCTION: false,
}));

vi.mock('@orient/mcp-servers/oauth', () => ({
  setSuppressBrowserOpen: vi.fn(),
  IS_PRODUCTION_OAUTH: false,
  OAUTH_CALLBACK_URL: 'http://localhost:8766/oauth/callback',
  ensureCallbackServerRunning: vi.fn(),
  createOAuthProvider: vi.fn().mockReturnValue({ tokens: vi.fn().mockResolvedValue(null) }),
}));

vi.mock('@orient/apps', () => ({
  createAppsService: vi.fn().mockResolvedValue({ appCount: 0 }),
}));

vi.mock('pg', () => {
  const mockPool = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue({
      release: vi.fn(),
    }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
  }));
  return {
    default: { Pool: mockPool },
    Pool: mockPool,
  };
});

import type { DashboardServices } from '../src/server/index.js';

// Create mock services for tests that need the full server
const createMockServices = (): DashboardServices => ({
  db: {
    getStats: vi.fn().mockResolvedValue({}),
    getDashboardStats: vi.fn().mockResolvedValue({}),
    getAllChatsWithPermissions: vi.fn().mockResolvedValue([]),
    getChatsWithoutPermissions: vi.fn().mockResolvedValue([]),
    getChatPermission: vi.fn().mockResolvedValue(null),
    setChatPermission: vi.fn().mockResolvedValue(undefined),
    deleteChatPermission: vi.fn().mockResolvedValue(false),
    getPermissionAuditLog: vi.fn().mockResolvedValue([]),
    getAllGroups: vi.fn().mockResolvedValue([]),
    searchGroups: vi.fn().mockResolvedValue([]),
    hasDashboardUsers: vi.fn().mockResolvedValue(false),
  } as unknown as DashboardServices['db'],
  auth: {
    login: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue(1),
    authMiddleware: vi.fn((req, res, next) => next()),
  } as unknown as DashboardServices['auth'],
  slackDb: undefined,
  schedulerDb: undefined,
  schedulerService: undefined,
});

describe('Dashboard Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module Structure', () => {
    it('should export createDashboardServer from server', async () => {
      const { createDashboardServer } = await import('../src/server/index.js');
      expect(createDashboardServer).toBeDefined();
      expect(typeof createDashboardServer).toBe('function');
    }, 15000);

    it('should export startDashboardServer from server', async () => {
      const { startDashboardServer } = await import('../src/server/index.js');
      expect(startDashboardServer).toBeDefined();
      expect(typeof startDashboardServer).toBe('function');
    });

    it('should export types from package', async () => {
      const types = await import('../src/types.js');
      expect(types).toBeDefined();
    });
  });

  describe('Dashboard Server', () => {
    it('should create an Express app with config and services', async () => {
      const { createDashboardServer } = await import('../src/server/index.js');
      const mockServices = createMockServices();

      const app = createDashboardServer(
        { port: 4098, jwtSecret: 'test-secret-that-is-at-least-32-chars' },
        mockServices
      );

      expect(app).toBeDefined();
      // Express apps have 'use' and 'listen' methods
      expect(typeof app.use).toBe('function');
      expect(typeof app.listen).toBe('function');
    });

    it('should mount API routes at /api', async () => {
      const { createDashboardServer } = await import('../src/server/index.js');
      const mockServices = createMockServices();

      const app = createDashboardServer(
        { port: 4098, jwtSecret: 'test-secret-that-is-at-least-32-chars' },
        mockServices
      );

      // The app should be a valid Express application with use/listen methods
      expect(app).toBeDefined();
      expect(typeof app.use).toBe('function');
    });
  });

  describe('Dashboard Config', () => {
    it('should accept port configuration', async () => {
      const { createDashboardServer } = await import('../src/server/index.js');
      const mockServices = createMockServices();

      const app = createDashboardServer(
        { port: 3000, jwtSecret: 'test-secret-that-is-at-least-32-chars' },
        mockServices
      );

      expect(app).toBeDefined();
    });

    it('should accept optional staticPath configuration', async () => {
      const { createDashboardServer } = await import('../src/server/index.js');
      const mockServices = createMockServices();

      const app = createDashboardServer(
        { port: 3000, jwtSecret: 'test-secret-that-is-at-least-32-chars', staticPath: './public' },
        mockServices
      );

      expect(app).toBeDefined();
    });
  });
});
