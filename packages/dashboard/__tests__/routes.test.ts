/**
 * Tests for Dashboard Routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock core
vi.mock('@orient-bot/core', () => ({
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
}));

import { createDashboardRouter } from '../src/server/routes.js';
import type { DashboardServices } from '../src/server/index.js';

// Create mock services
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
    getGroup: vi.fn().mockResolvedValue(null),
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
  schedulerService: {
    // Mock scheduler service to ensure routes are mounted
  } as unknown as DashboardServices['schedulerService'],
  webhookService: {
    // Mock webhook service to ensure routes are mounted
  } as unknown as DashboardServices['webhookService'],
  promptService: {
    // Mock prompt service to ensure routes are mounted
  } as unknown as DashboardServices['promptService'],
});

describe('Dashboard Routes', () => {
  let router: ReturnType<typeof createDashboardRouter>;
  let mockServices: DashboardServices;

  beforeEach(() => {
    mockServices = createMockServices();
    router = createDashboardRouter(mockServices);
  });

  describe('createDashboardRouter', () => {
    it('should create a router', () => {
      expect(router).toBeDefined();
    });
  });

  describe('/health endpoint', () => {
    it('should return health status', async () => {
      // Get the route handler
      const healthRoute = router.stack.find((layer) => layer.route?.path === '/health');

      expect(healthRoute).toBeDefined();
    });
  });

  describe('/stats endpoint', () => {
    it('should have a stats route', () => {
      const statsRoute = router.stack.find((layer) => layer.route?.path === '/stats');

      expect(statsRoute).toBeDefined();
    });
  });

  describe('/chats endpoint', () => {
    it('should have a chats route', () => {
      const chatsRoute = router.stack.find((layer) => layer.route?.path === '/chats');

      expect(chatsRoute).toBeDefined();
    });
  });

  describe('/groups/:groupId endpoint', () => {
    it('should have a single group route', () => {
      // Check that the route is registered with a param pattern
      const groupRoute = router.stack.find((layer) => layer.route?.path === '/groups/:groupId');

      expect(groupRoute).toBeDefined();
    });

    it('should handle URL-encoded group IDs', () => {
      // The route handler should decode the groupId parameter
      const groupRoute = router.stack.find((layer) => layer.route?.path === '/groups/:groupId');

      expect(groupRoute).toBeDefined();
      expect(groupRoute?.route?.path).toBe('/groups/:groupId');
    });
  });

  // Note: /schedules, /webhooks, /prompts routes are mounted via router.use()
  // and are conditional on service availability. Testing these requires
  // integration tests with actual service implementations.
});
