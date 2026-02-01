/**
 * Tests for Version Routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../src/auth.js';

// Use vi.hoisted to ensure mock values are available for hoisted vi.mock calls
const { mockVersionCheckService, mockPreferencesService } = vi.hoisted(() => ({
  mockVersionCheckService: {
    checkVersion: vi.fn(),
    getStatus: vi.fn(),
    isEnabled: vi.fn(),
    getCurrentVersion: vi.fn(),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    clearCache: vi.fn(),
  },
  mockPreferencesService: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    dismissVersion: vi.fn(),
    remindLater: vi.fn(),
    shouldShowNotification: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../src/services/versionCheckService.js', () => ({
  getVersionCheckService: () => mockVersionCheckService,
}));

vi.mock('@orient-bot/database-services', () => ({
  createVersionPreferencesService: () => mockPreferencesService,
}));

import { createVersionRoutes } from '../src/server/routes/version.routes.js';

const mockRequireAuth = vi.fn((_req: Request, _res: Response, next: () => void) => next());

const createMockReqRes = (overrides?: { user?: { userId: number } }) => {
  const req = {
    params: {},
    body: {},
    query: {},
    user: overrides?.user || { userId: 1 },
  } as unknown as AuthenticatedRequest;

  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
};

describe('Version Routes', () => {
  let router: ReturnType<typeof createVersionRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createVersionRoutes(mockRequireAuth);
  });

  it('should create a router', () => {
    expect(router).toBeDefined();
  });

  describe('GET /status', () => {
    it('should return version status', async () => {
      const mockStatus = {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
        changelogUrl: 'https://github.com/orient-bot/orient/releases',
        lastChecked: new Date(),
      };

      mockVersionCheckService.checkVersion.mockResolvedValue(mockStatus);
      mockPreferencesService.shouldShowNotification.mockResolvedValue(true);

      const { req, res } = createMockReqRes();
      const route = router.stack.find((layer) => layer.route?.path === '/status');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.json).toHaveBeenCalled();
      const payload = vi.mocked(res.json).mock.calls[0][0];
      expect(payload.currentVersion).toBe('1.0.0');
      expect(payload.latestVersion).toBe('1.1.0');
      expect(payload.updateAvailable).toBe(true);
      expect(payload.shouldShowNotification).toBe(true);
    });

    it('should respect refresh query parameter', async () => {
      mockVersionCheckService.checkVersion.mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: null,
        updateAvailable: false,
        changelogUrl: '',
        lastChecked: new Date(),
      });

      const { req, res } = createMockReqRes();
      req.query = { refresh: 'true' };

      const route = router.stack.find((layer) => layer.route?.path === '/status');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockVersionCheckService.checkVersion).toHaveBeenCalledWith(true);
    });
  });

  describe('GET /service-status', () => {
    it('should return service configuration status', async () => {
      const mockServiceStatus = {
        enabled: true,
        polling: true,
        endpoint: 'https://example.com/version.json',
        intervalHours: 6,
        currentVersion: '1.0.0',
      };

      mockVersionCheckService.getStatus.mockReturnValue(mockServiceStatus);

      const { req, res } = createMockReqRes();
      const route = router.stack.find((layer) => layer.route?.path === '/service-status');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith(mockServiceStatus);
    });
  });

  describe('GET /preferences', () => {
    it('should return user preferences', async () => {
      const mockPrefs = {
        userId: 1,
        notificationsEnabled: true,
        dismissedVersions: [],
        remindLaterUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPreferencesService.getPreferences.mockResolvedValue(mockPrefs);

      const { req, res } = createMockReqRes();
      // Find the route that handles GET on /preferences
      const route = router.stack.find(
        (layer) => layer.route?.path === '/preferences' && layer.route?.methods?.get
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith(mockPrefs);
    });

    it('should return 401 if not authenticated', async () => {
      const { req, res } = createMockReqRes();
      req.user = undefined;

      // Find the route that handles GET on /preferences
      const route = router.stack.find(
        (layer) => layer.route?.path === '/preferences' && layer.route?.methods?.get
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('PUT /preferences', () => {
    it('should update user preferences', async () => {
      const updatedPrefs = {
        userId: 1,
        notificationsEnabled: false,
        dismissedVersions: [],
        remindLaterUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPreferencesService.updatePreferences.mockResolvedValue(updatedPrefs);

      const { req, res } = createMockReqRes();
      req.body = { notificationsEnabled: false };

      // Find the route that handles PUT on /preferences
      const route = router.stack.find(
        (layer) => layer.route?.path === '/preferences' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockPreferencesService.updatePreferences).toHaveBeenCalledWith(1, {
        notificationsEnabled: false,
      });
      expect(res.json).toHaveBeenCalledWith(updatedPrefs);
    });

    it('should reject invalid notificationsEnabled type', async () => {
      const { req, res } = createMockReqRes();
      req.body = { notificationsEnabled: 'invalid' };

      // Find the route that handles PUT on /preferences
      const route = router.stack.find(
        (layer) => layer.route?.path === '/preferences' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /dismiss', () => {
    it('should dismiss a version', async () => {
      mockPreferencesService.dismissVersion.mockResolvedValue(undefined);

      const { req, res } = createMockReqRes();
      req.body = { version: '1.1.0' };

      const route = router.stack.find((layer) => layer.route?.path === '/dismiss');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockPreferencesService.dismissVersion).toHaveBeenCalledWith(1, '1.1.0');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Version 1.1.0 dismissed',
      });
    });

    it('should reject missing version', async () => {
      const { req, res } = createMockReqRes();
      req.body = {};

      const route = router.stack.find((layer) => layer.route?.path === '/dismiss');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /remind-later', () => {
    it('should set remind later for valid hours', async () => {
      mockPreferencesService.remindLater.mockResolvedValue(undefined);

      const { req, res } = createMockReqRes();
      req.body = { hours: 24 };

      const route = router.stack.find((layer) => layer.route?.path === '/remind-later');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockPreferencesService.remindLater).toHaveBeenCalledWith(1, 24);
      expect(res.json).toHaveBeenCalled();
      const payload = vi.mocked(res.json).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.remindLaterUntil).toBeDefined();
    });

    it('should reject invalid hours', async () => {
      const { req, res } = createMockReqRes();
      req.body = { hours: 12 }; // Not in valid list [1, 24, 168]

      const route = router.stack.find((layer) => layer.route?.path === '/remind-later');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /check-now', () => {
    it('should force a version check', async () => {
      const mockStatus = {
        currentVersion: '1.0.0',
        latestVersion: '1.2.0',
        updateAvailable: true,
        changelogUrl: 'https://github.com/orient-bot/orient/releases',
        lastChecked: new Date(),
      };

      mockVersionCheckService.checkVersion.mockResolvedValue(mockStatus);
      mockPreferencesService.shouldShowNotification.mockResolvedValue(true);

      const { req, res } = createMockReqRes();
      const route = router.stack.find((layer) => layer.route?.path === '/check-now');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockVersionCheckService.checkVersion).toHaveBeenCalledWith(true);
      expect(res.json).toHaveBeenCalled();
    });
  });
});
