/**
 * Tests for Onboarder Routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';

// Mock core
vi.mock('@orientbot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { createOnboarderRoutes } from '../src/server/routes/onboarder.routes.js';
import type { MessageDatabase } from '../src/services/messageDatabase.js';

type MockResponse = {
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
};

const createMockReqRes = () => {
  const req = {
    params: {},
    body: {},
    headers: {},
    user: { userId: 1, username: 'tester' },
  } as unknown as Request;

  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as MockResponse & Response;

  return { req, res };
};

// Mock auth middleware that always passes
const mockRequireAuth = vi.fn((req: Request, res: Response, next: () => void) => next());

// Mock database
const mockDb: Partial<MessageDatabase> = {
  getActiveOnboarderSession: vi.fn().mockResolvedValue(undefined),
  createOnboarderSession: vi
    .fn()
    .mockResolvedValue({ id: 1, sessionId: 'session-1', title: 'Test' }),
  touchOnboarderSession: vi.fn().mockResolvedValue(true),
  getOnboarderSessions: vi.fn().mockResolvedValue([]),
  setActiveOnboarderSession: vi.fn().mockResolvedValue(true),
  clearOnboarderSessions: vi.fn().mockResolvedValue(0),
};

describe('Onboarder Routes', () => {
  let router: ReturnType<typeof createOnboarderRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createOnboarderRoutes(mockDb as MessageDatabase, mockRequireAuth);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should create a router', () => {
    expect(router).toBeDefined();
  });

  it('should register /chat and /session routes', () => {
    const chatRoute = router.stack.find((layer) => layer.route?.path === '/chat');
    const sessionRoute = router.stack.find((layer) => layer.route?.path === '/session');
    const suggestionsRoute = router.stack.find((layer) => layer.route?.path === '/suggestions');

    expect(chatRoute).toBeDefined();
    expect(sessionRoute).toBeDefined();
    expect(suggestionsRoute).toBeDefined();
  });

  it('should parse actions from OpenCode response', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/session')) {
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'session-1' }),
        } as Response;
      }
      if (url.includes('/session/session-1/message')) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              parts: [
                {
                  type: 'text',
                  text: 'Hello there!\n[action:Go to Agents|/agents?ori_highlight=.agent-card]',
                },
              ],
            }),
        } as Response;
      }
      return { ok: false, text: async () => 'Unexpected' } as Response;
    });

    const { req, res } = createMockReqRes();
    req.body = { message: 'Hi' };

    const chatRoute = router.stack.find((layer) => layer.route?.path === '/chat');
    const handler = chatRoute?.route?.stack[1]?.handle;
    if (handler) {
      await handler(req, res, () => {});
    }

    expect(res.json).toHaveBeenCalled();
    const response = vi.mocked(res.json).mock.calls[0][0];
    expect(response).toMatchObject({
      sessionId: 'session-1',
      message: 'Hello there!',
    });
    expect(response.actions).toEqual([
      {
        label: 'Go to Agents',
        route: '/agents',
        params: { ori_highlight: '.agent-card' },
      },
    ]);

    vi.unstubAllGlobals();
  });
});
