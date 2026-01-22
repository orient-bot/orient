/**
 * Tests for Feature Flags Routes
 *
 * Tests the config-based feature flags API endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Use vi.hoisted to ensure mock values are available for hoisted vi.mock calls
const {
  mockGetConfig,
  mockResolveFeatureFlags,
  mockGetFeatureFlagsForApi,
  mockGetAllFlagIds,
  mockGetEnvVarName,
  mockPRE_LAUNCH_DEFAULTS,
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockResolveFeatureFlags: vi.fn(),
  mockGetFeatureFlagsForApi: vi.fn(),
  mockGetAllFlagIds: vi.fn(),
  mockGetEnvVarName: vi.fn(),
  mockPRE_LAUNCH_DEFAULTS: {
    miniApps: { enabled: false, uiStrategy: 'hide' },
    automation: { enabled: false, uiStrategy: 'hide' },
  },
}));

vi.mock('@orient/core', () => ({
  getConfig: () => mockGetConfig(),
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  resolveFeatureFlags: (flags: unknown) => mockResolveFeatureFlags(flags),
  getFeatureFlagsForApi: (flags: unknown) => mockGetFeatureFlagsForApi(flags),
  getAllFlagIds: () => mockGetAllFlagIds(),
  getEnvVarName: (flagId: string) => mockGetEnvVarName(flagId),
  PRE_LAUNCH_DEFAULTS: mockPRE_LAUNCH_DEFAULTS,
}));

import { createFeatureFlagsRoutes } from '../src/server/routes/featureFlags.routes.js';

const mockRequireAuth = vi.fn((_req: Request, _res: Response, next: () => void) => next());

const createMockReqRes = () => {
  const req = {
    params: {},
    body: {},
    query: {},
  } as unknown as Request;

  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
};

describe('Feature Flags Routes', () => {
  let router: ReturnType<typeof createFeatureFlagsRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createFeatureFlagsRoutes(mockRequireAuth);
  });

  it('should create a router', () => {
    expect(router).toBeDefined();
  });

  describe('GET /', () => {
    it('should return resolved feature flags', async () => {
      const mockConfig = {
        features: { miniApps: { enabled: true, uiStrategy: 'hide' } },
      };
      const mockResolved = {
        miniApps: { enabled: true, uiStrategy: 'hide' },
        automation: { enabled: false, uiStrategy: 'hide' },
      };
      const mockApiFlags = { ...mockResolved };

      mockGetConfig.mockReturnValue(mockConfig);
      mockResolveFeatureFlags.mockReturnValue(mockResolved);
      mockGetFeatureFlagsForApi.mockReturnValue(mockApiFlags);

      const { req, res } = createMockReqRes();
      const route = router.stack.find(
        (layer) => layer.route?.path === '/' && layer.route?.methods?.get
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockGetConfig).toHaveBeenCalled();
      expect(mockResolveFeatureFlags).toHaveBeenCalledWith(mockConfig.features);
      expect(res.json).toHaveBeenCalledWith({ flags: mockApiFlags });
    });

    it('should return fallback flags on error', async () => {
      mockGetConfig.mockImplementation(() => {
        throw new Error('Config error');
      });
      mockGetFeatureFlagsForApi.mockReturnValue(mockPRE_LAUNCH_DEFAULTS);

      const { req, res } = createMockReqRes();
      const route = router.stack.find(
        (layer) => layer.route?.path === '/' && layer.route?.methods?.get
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({ flags: mockPRE_LAUNCH_DEFAULTS });
    });
  });

  describe('GET /documentation', () => {
    it('should return flag documentation', async () => {
      const mockFlagIds = ['miniApps', 'automation'];
      mockGetAllFlagIds.mockReturnValue(mockFlagIds);
      mockGetEnvVarName.mockImplementation((id: string) => `FEATURE_FLAG_${id.toUpperCase()}`);

      const { req, res } = createMockReqRes();
      const route = router.stack.find((layer) => layer.route?.path === '/documentation');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockGetAllFlagIds).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        documentation: [
          { flagId: 'miniApps', envVar: 'FEATURE_FLAG_MINIAPPS', defaultEnabled: false },
          { flagId: 'automation', envVar: 'FEATURE_FLAG_AUTOMATION', defaultEnabled: false },
        ],
        notes: expect.any(Array),
      });
    });
  });

  describe('PUT /:flagId', () => {
    it('should accept valid flag update request', async () => {
      mockGetAllFlagIds.mockReturnValue(['miniApps', 'automation']);
      mockGetEnvVarName.mockReturnValue('FEATURE_FLAG_MINI_APPS');

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'miniApps' };
      req.body = { enabled: true, uiStrategy: 'notify' };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('not persisted'),
        flagId: 'miniApps',
        hint: expect.stringContaining('FEATURE_FLAG_MINI_APPS'),
      });
    });

    it('should return 404 for unknown flag', async () => {
      mockGetAllFlagIds.mockReturnValue(['miniApps', 'automation']);

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'unknownFlag' };
      req.body = { enabled: true };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for invalid enabled value', async () => {
      mockGetAllFlagIds.mockReturnValue(['miniApps']);

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'miniApps' };
      req.body = { enabled: 'invalid' };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid uiStrategy', async () => {
      mockGetAllFlagIds.mockReturnValue(['miniApps']);

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'miniApps' };
      req.body = { uiStrategy: 'invalid' };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
