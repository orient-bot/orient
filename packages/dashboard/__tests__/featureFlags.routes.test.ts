/**
 * Tests for Feature Flags Routes
 *
 * Tests the database-backed feature flags API endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock database
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

const mockDb = {
  select: () => {
    mockSelect();
    return {
      from: (table: unknown) => {
        mockFrom(table);
        return {
          where: (condition: unknown) => {
            mockWhere(condition);
            return {
              limit: (n: number) => {
                mockLimit(n);
                return Promise.resolve([]);
              },
            };
          },
          orderBy: (field: unknown) => {
            mockOrderBy(field);
            return Promise.resolve([]);
          },
        };
      },
    };
  },
  update: (table: unknown) => {
    mockUpdate(table);
    return {
      set: (values: unknown) => {
        mockSet(values);
        return {
          where: () => Promise.resolve(),
        };
      },
    };
  },
};

vi.mock('@orient/database', () => ({
  getDatabase: () => mockDb,
  featureFlags: { id: 'id', sortOrder: 'sortOrder' },
  eq: vi.fn((a, b) => ({ a, b })),
}));

vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
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

// Helper to get route handler from express router
const getHandler = (
  router: ReturnType<typeof createFeatureFlagsRoutes>,
  path: string,
  method: 'get' | 'put' | 'delete'
) => {
  const route = router.stack.find(
    (layer) => layer.route?.path === path && layer.route?.methods?.[method]
  );
  // Handler is after the auth middleware (index 1)
  return route?.route?.stack[1]?.handle;
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
    it('should return feature flags from database', async () => {
      const mockFlags = [
        {
          id: 'miniApps',
          name: 'Mini Apps',
          description: 'Enable mini apps feature',
          enabled: true,
          category: 'ui',
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Override the mock to return flags
      mockDb.select = () => ({
        from: () => ({
          orderBy: () => Promise.resolve(mockFlags),
        }),
      });

      const { req, res } = createMockReqRes();
      const handler = getHandler(router, '/', 'get');

      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalledWith({
        flags: expect.arrayContaining([
          expect.objectContaining({
            id: 'miniApps',
            name: 'Mini Apps',
            enabled: true,
          }),
        ]),
      });
    });

    it('should return 500 on database error', async () => {
      mockDb.select = () => ({
        from: () => ({
          orderBy: () => Promise.reject(new Error('Database error')),
        }),
      });

      const { req, res } = createMockReqRes();
      const handler = getHandler(router, '/', 'get');

      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to retrieve feature flags',
      });
    });
  });

  describe('PUT /:flagId', () => {
    it('should update a feature flag', async () => {
      const mockFlags = [
        {
          id: 'miniApps',
          name: 'Mini Apps',
          description: 'Enable mini apps feature',
          enabled: true,
          category: 'ui',
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Mock finding the flag and then returning updated list
      let selectCallCount = 0;
      mockDb.select = () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              selectCallCount++;
              // First call checks if flag exists, second call returns updated list
              if (selectCallCount === 1) {
                return Promise.resolve([mockFlags[0]]);
              }
              return Promise.resolve(mockFlags);
            },
          }),
          orderBy: () => Promise.resolve(mockFlags),
        }),
      });

      mockDb.update = () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      });

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'miniApps' };
      req.body = { enabled: true };

      const handler = getHandler(router, '/:flagId', 'put');

      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        flags: expect.any(Array),
      });
    });

    it('should return 404 for unknown flag', async () => {
      mockDb.select = () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      });

      const { req, res } = createMockReqRes();
      req.params = { flagId: 'unknownFlag' };
      req.body = { enabled: true };

      const handler = getHandler(router, '/:flagId', 'put');

      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for invalid enabled value', async () => {
      const { req, res } = createMockReqRes();
      req.params = { flagId: 'miniApps' };
      req.body = { enabled: 'invalid' };

      const handler = getHandler(router, '/:flagId', 'put');

      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /effective', () => {
    it('should return flat flag values', async () => {
      const mockFlags = [
        { id: 'miniApps', enabled: true },
        { id: 'automation', enabled: false },
      ];

      mockDb.select = () => ({
        from: () => ({
          orderBy: () => Promise.resolve(mockFlags),
        }),
      });

      const { req, res } = createMockReqRes();
      const handler = getHandler(router, '/effective', 'get');

      if (handler) {
        await handler(req, res, () => {});
      }

      expect(res.json).toHaveBeenCalledWith({
        flags: {
          miniApps: true,
          automation: false,
        },
      });
    });
  });
});
