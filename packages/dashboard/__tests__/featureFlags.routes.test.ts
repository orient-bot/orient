/**
 * Tests for Feature Flags Routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../src/auth.js';

// Use vi.hoisted to ensure mock values are available for hoisted vi.mock calls
const { mockFeatureFlagsService } = vi.hoisted(() => ({
  mockFeatureFlagsService: {
    getAllFlags: vi.fn(),
    getAllFlagsWithOverrides: vi.fn(),
    getEffectiveFlags: vi.fn(),
    setUserOverride: vi.fn(),
    removeUserOverride: vi.fn(),
    getParentId: vi.fn(),
    getAncestorIds: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@orient/database-services', () => ({
  createFeatureFlagsService: () => mockFeatureFlagsService,
}));

import { createFeatureFlagsRoutes } from '../src/server/routes/featureFlags.routes.js';

const mockRequireAuth = vi.fn((_req: Request, _res: Response, next: () => void) => next());

const createMockReqRes = (overrides?: { user?: { userId: number; username: string } }) => {
  const req = {
    params: {},
    body: {},
    query: {},
    user: overrides?.user || { userId: 1, username: 'testuser' },
  } as unknown as AuthenticatedRequest;

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
    it('should return all flags with user overrides', async () => {
      const mockFlags = [
        {
          id: 'mini_apps',
          name: 'Mini-Apps',
          description: 'AI-generated web applications',
          enabled: true,
          category: 'ui',
          sortOrder: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
          userOverride: null,
          effectiveValue: true,
        },
        {
          id: 'mini_apps.create',
          name: 'Create App',
          description: 'Create new mini-apps',
          enabled: true,
          category: 'ui',
          sortOrder: 11,
          createdAt: new Date(),
          updatedAt: new Date(),
          userOverride: false,
          effectiveValue: false,
        },
      ];

      mockFeatureFlagsService.getAllFlagsWithOverrides.mockResolvedValue(mockFlags);

      const { req, res } = createMockReqRes();
      const route = router.stack.find(
        (layer) => layer.route?.path === '/' && layer.route?.methods?.get
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockFeatureFlagsService.getAllFlagsWithOverrides).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({ flags: mockFlags });
    });

    it('should return 401 if not authenticated', async () => {
      const { req, res } = createMockReqRes();
      req.user = undefined;

      const route = router.stack.find(
        (layer) => layer.route?.path === '/' && layer.route?.methods?.get
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('GET /effective', () => {
    it('should return effective flag values as flat object', async () => {
      const mockEffective = {
        mini_apps: true,
        'mini_apps.create': false,
        monitoring: true,
      };

      mockFeatureFlagsService.getEffectiveFlags.mockResolvedValue(mockEffective);

      const { req, res } = createMockReqRes();
      const route = router.stack.find((layer) => layer.route?.path === '/effective');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockFeatureFlagsService.getEffectiveFlags).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({ flags: mockEffective });
    });

    it('should return 401 if not authenticated', async () => {
      const { req, res } = createMockReqRes();
      req.user = undefined;

      const route = router.stack.find((layer) => layer.route?.path === '/effective');
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('PUT /:flagId/override', () => {
    it('should set a user override', async () => {
      const mockFlags = [
        {
          id: 'mini_apps',
          name: 'Mini-Apps',
          enabled: true,
          userOverride: false,
          effectiveValue: false,
        },
      ];

      mockFeatureFlagsService.setUserOverride.mockResolvedValue(undefined);
      mockFeatureFlagsService.getAllFlagsWithOverrides.mockResolvedValue(mockFlags);

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'mini_apps' };
      req.body = { enabled: false };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId/override' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockFeatureFlagsService.setUserOverride).toHaveBeenCalledWith(1, 'mini_apps', false);
      expect(res.json).toHaveBeenCalledWith({ success: true, flags: mockFlags });
    });

    it('should reject non-boolean enabled value', async () => {
      const { req, res } = createMockReqRes();
      req.params = { flagId: 'mini_apps' };
      req.body = { enabled: 'invalid' };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId/override' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if flag does not exist', async () => {
      mockFeatureFlagsService.setUserOverride.mockRejectedValue(
        new Error("Feature flag 'nonexistent' does not exist")
      );

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'nonexistent' };
      req.body = { enabled: false };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId/override' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 401 if not authenticated', async () => {
      const { req, res } = createMockReqRes();
      req.user = undefined;
      req.params = { flagId: 'mini_apps' };
      req.body = { enabled: false };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId/override' && layer.route?.methods?.put
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('DELETE /:flagId/override', () => {
    it('should remove a user override', async () => {
      const mockFlags = [
        {
          id: 'mini_apps',
          name: 'Mini-Apps',
          enabled: true,
          userOverride: null,
          effectiveValue: true,
        },
      ];

      mockFeatureFlagsService.removeUserOverride.mockResolvedValue(undefined);
      mockFeatureFlagsService.getAllFlagsWithOverrides.mockResolvedValue(mockFlags);

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'mini_apps' };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId/override' && layer.route?.methods?.delete
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(mockFeatureFlagsService.removeUserOverride).toHaveBeenCalledWith(1, 'mini_apps');
      expect(res.json).toHaveBeenCalledWith({ success: true, flags: mockFlags });
    });

    it('should return 401 if not authenticated', async () => {
      const { req, res } = createMockReqRes();
      req.user = undefined;
      req.params = { flagId: 'mini_apps' };

      const route = router.stack.find(
        (layer) => layer.route?.path === '/:flagId/override' && layer.route?.methods?.delete
      );
      const handler = route?.route?.stack[1]?.handle;

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
