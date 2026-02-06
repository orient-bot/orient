/**
 * Tests for writeToOrientEnv() and PM2 restart mode in providers.routes.ts
 *
 * Covers .env file creation, key updates, value escaping,
 * and PM2 mode detection for restart-opencode endpoint.
 *
 * Run with: pnpm --filter @orient-bot/dashboard test writeToOrientEnv
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// Hoisted mocks for cross-module sharing
const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockExecSync,
  mockSetSecretOverrides,
  mockInvalidateConfigCache,
  mockSecretsService,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockExecSync: vi.fn(),
  mockSetSecretOverrides: vi.fn(),
  mockInvalidateConfigCache: vi.fn(),
  mockSecretsService: {
    listSecrets: vi.fn(),
    getSecret: vi.fn(),
    setSecret: vi.fn(),
    getAllSecrets: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    stdout: { pipe: vi.fn() },
    stderr: { pipe: vi.fn() },
    unref: vi.fn(),
  })),
  execSync: (...args: any[]) => mockExecSync(...args),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: (...args: any[]) => mockExistsSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: any[]) => mockMkdirSync(...args),
    createWriteStream: vi.fn(() => ({ write: vi.fn(), end: vi.fn() })),
  };
});

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  invalidateConfigCache: mockInvalidateConfigCache,
  setSecretOverrides: mockSetSecretOverrides,
}));

vi.mock('@orient-bot/database-services', () => ({
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

describe('writeToOrientEnv (via PUT /:provider/key)', () => {
  let router: ReturnType<typeof createProvidersRoutes>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.ORIENT_HOME = '/test/.orient';
    router = createProvidersRoutes(mockRequireAuth);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should write API key to .env when saving a provider key', async () => {
    mockSecretsService.setSecret.mockResolvedValue(undefined);
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('.env')) return false;
      return false;
    });

    const { req, res } = createMockReqRes();
    req.params = { provider: 'anthropic' };
    req.body = { value: 'sk-ant-test-key-123' };

    const route = router.stack.find((layer) => layer.route?.path === '/:provider/key');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(res.json).toHaveBeenCalledWith({ success: true });
    // Verify writeToOrientEnv was called (via writeFileSync)
    expect(mockWriteFileSync).toHaveBeenCalled();
    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('ANTHROPIC_API_KEY=sk-ant-test-key-123');
  });

  it('should create .env file if it does not exist', async () => {
    mockSecretsService.setSecret.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(false);

    const { req, res } = createMockReqRes();
    req.params = { provider: 'openai' };
    req.body = { value: 'sk-test-openai' };

    const route = router.stack.find((layer) => layer.route?.path === '/:provider/key');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(mockMkdirSync).toHaveBeenCalledWith('/test/.orient', { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('should update existing key in .env instead of appending', async () => {
    mockSecretsService.setSecret.mockResolvedValue(undefined);
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('.env')) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue('OPENAI_API_KEY=old-key\nOTHER_VAR=keep-me\n');

    const { req, res } = createMockReqRes();
    req.params = { provider: 'openai' };
    req.body = { value: 'new-key-value' };

    const route = router.stack.find((layer) => layer.route?.path === '/:provider/key');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('OPENAI_API_KEY=new-key-value');
    expect(writtenContent).toContain('OTHER_VAR=keep-me');
    // Should not have duplicate OPENAI_API_KEY entries
    const matches = writtenContent.match(/OPENAI_API_KEY=/g);
    expect(matches?.length).toBe(1);
  });

  it('should escape values containing spaces', async () => {
    mockSecretsService.setSecret.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(false);

    const { req, res } = createMockReqRes();
    req.params = { provider: 'openai' };
    req.body = { value: 'key with spaces' };

    const route = router.stack.find((layer) => layer.route?.path === '/:provider/key');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('OPENAI_API_KEY="key with spaces"');
  });

  it('should escape values containing hash or equals signs', async () => {
    mockSecretsService.setSecret.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(false);

    const { req, res } = createMockReqRes();
    req.params = { provider: 'openai' };
    req.body = { value: 'key#with=special' };

    const route = router.stack.find((layer) => layer.route?.path === '/:provider/key');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('OPENAI_API_KEY="key#with=special"');
  });

  it('should not escape simple alphanumeric values', async () => {
    mockSecretsService.setSecret.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(false);

    const { req, res } = createMockReqRes();
    req.params = { provider: 'anthropic' };
    req.body = { value: 'sk-ant-simple-key' };

    const route = router.stack.find((layer) => layer.route?.path === '/:provider/key');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    const writtenContent = mockWriteFileSync.mock.calls[0]?.[1] as string;
    // Simple key should NOT be quoted
    expect(writtenContent).toContain('ANTHROPIC_API_KEY=sk-ant-simple-key');
    expect(writtenContent).not.toContain('"sk-ant-simple-key"');
  });
});

describe('restart-opencode PM2 mode', () => {
  let router: ReturnType<typeof createProvidersRoutes>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.ORIENT_HOME = '/test/.orient';
    process.env.PROJECT_ROOT = '/test/project';
    router = createProvidersRoutes(mockRequireAuth);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should use PM2 restart when no PID file exists', async () => {
    // No PID file = not dev mode
    mockExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('opencode.pid')) return false;
      if (typeof p === 'string' && p.includes('.env')) return false;
      return false;
    });
    mockSecretsService.getAllSecrets.mockResolvedValue({
      ANTHROPIC_API_KEY: 'sk-test',
    });
    mockExecSync.mockReturnValue(Buffer.from(''));

    const { req, res } = createMockReqRes();
    const route = router.stack.find((layer) => layer.route?.path === '/restart-opencode');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(mockExecSync).toHaveBeenCalledWith('pm2 restart orient-opencode --update-env', {
      timeout: 15000,
      stdio: 'pipe',
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        mode: 'pm2',
      })
    );
  });

  it('should sync secrets to .env before PM2 restart', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('opencode.pid')) return false;
      if (typeof p === 'string' && p.includes('.env')) return false;
      return false;
    });
    mockSecretsService.getAllSecrets.mockResolvedValue({
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      OPENAI_API_KEY: 'sk-oai-secret',
    });
    mockExecSync.mockReturnValue(Buffer.from(''));

    const { req, res } = createMockReqRes();
    const route = router.stack.find((layer) => layer.route?.path === '/restart-opencode');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    // writeFileSync should have been called to write secrets to .env
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockSetSecretOverrides).toHaveBeenCalled();
    expect(mockInvalidateConfigCache).toHaveBeenCalled();
  });

  it('should return error when PM2 restart fails', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('opencode.pid')) return false;
      if (typeof p === 'string' && p.includes('.env')) return false;
      return false;
    });
    mockSecretsService.getAllSecrets.mockResolvedValue({});
    mockExecSync.mockImplementation(() => {
      throw new Error('pm2 not found');
    });

    const { req, res } = createMockReqRes();
    const route = router.stack.find((layer) => layer.route?.path === '/restart-opencode');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Could not restart OpenCode',
      })
    );
  });

  it('should fall through to dev mode restart when PID file exists', async () => {
    // PID file exists = dev mode (should NOT try PM2)
    mockExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('opencode.pid')) return true;
      if (typeof p === 'string' && p.includes('opencode')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('opencode.pid')) return '99999';
      return '';
    });
    mockSecretsService.getAllSecrets.mockResolvedValue({});
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ healthy: true }),
    });

    const { req, res } = createMockReqRes();
    const route = router.stack.find((layer) => layer.route?.path === '/restart-opencode');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    // Should NOT have called pm2
    expect(mockExecSync).not.toHaveBeenCalled();
    // Should have killed the old process
    expect(process.kill).toHaveBeenCalledWith(99999, 'SIGTERM');
  });

  it('should report secretsLoaded count in PM2 mode response', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('opencode.pid')) return false;
      if (typeof p === 'string' && p.includes('.env')) return false;
      return false;
    });
    mockSecretsService.getAllSecrets.mockResolvedValue({
      KEY1: 'val1',
      KEY2: 'val2',
      KEY3: 'val3',
    });
    mockExecSync.mockReturnValue(Buffer.from(''));

    const { req, res } = createMockReqRes();
    const route = router.stack.find((layer) => layer.route?.path === '/restart-opencode');
    const handler = route?.route?.stack[1]?.handle;

    await handler(req, res, () => {});

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        secretsLoaded: 3,
      })
    );
  });
});
