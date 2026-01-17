/**
 * Tests for Providers Routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Use vi.hoisted to ensure mock values are available for hoisted vi.mock calls
const { mockSetSecretOverrides, mockInvalidateConfigCache, mockSecretsService } = vi.hoisted(
  () => ({
    mockSetSecretOverrides: vi.fn(),
    mockInvalidateConfigCache: vi.fn(),
    mockSecretsService: {
      listSecrets: vi.fn(),
      getSecret: vi.fn(),
      setSecret: vi.fn(),
    },
  })
);

vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  invalidateConfigCache: mockInvalidateConfigCache,
  setSecretOverrides: mockSetSecretOverrides,
}));

vi.mock('@orient/database-services', () => ({
  createSecretsService: () => mockSecretsService,
}));

import { createProvidersRoutes } from '../src/server/routes/providers.routes.js';

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

describe('Providers Routes', () => {
  let router: ReturnType<typeof createProvidersRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createProvidersRoutes(mockRequireAuth);
  });

  it('should create a router', () => {
    expect(router).toBeDefined();
  });

  it('should list provider status', async () => {
    mockSecretsService.listSecrets.mockResolvedValue([
      { key: 'OPENAI_API_KEY', updatedAt: '2025-01-01T00:00:00.000Z' },
    ]);

    const { req, res } = createMockReqRes();
    const route = router.stack.find((layer) => layer.route?.path === '/');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(res.json).toHaveBeenCalled();
    const payload = vi.mocked(res.json).mock.calls[0][0];
    const openai = payload.providers.find((provider: { id: string }) => provider.id === 'openai');
    const anthropic = payload.providers.find(
      (provider: { id: string }) => provider.id === 'anthropic'
    );
    expect(openai.configured).toBe(true);
    expect(anthropic.configured).toBe(false);
  });

  it('should reject unknown provider key updates', async () => {
    const { req, res } = createMockReqRes();
    req.params = { provider: 'unknown' };
    req.body = { value: 'abc' };

    const route = router.stack.find((layer) => layer.route?.path === '/:provider/key');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should fall back to defaults when stored defaults are invalid', async () => {
    mockSecretsService.getSecret.mockResolvedValue('{not-json');

    const { req, res } = createMockReqRes();
    const route = router.stack.find((layer) => layer.route?.path === '/defaults');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(res.json).toHaveBeenCalled();
    const payload = vi.mocked(res.json).mock.calls[0][0];
    expect(payload.defaults).toEqual({
      transcription: 'openai',
      vision: 'anthropic',
      imageGeneration: 'openai',
    });
  });

  it('should store normalized defaults', async () => {
    const { req, res } = createMockReqRes();
    req.body = {
      transcription: 'openai',
      vision: 'openai',
      imageGeneration: 'google',
    };

    // Find the PUT /defaults route (not GET /defaults)
    const route = router.stack.find(
      (layer) => layer.route?.path === '/defaults' && layer.route?.methods?.put
    );
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(mockSecretsService.setSecret).toHaveBeenCalled();
    expect(mockSetSecretOverrides).toHaveBeenCalled();
    expect(mockInvalidateConfigCache).toHaveBeenCalled();
  });
});
