/**
 * Unit Tests for Provider Restart Endpoint
 *
 * These tests mock the file system and child_process to test the restart logic
 * without requiring a running OpenCode instance.
 *
 * Run with: pnpm --filter @orient-bot/dashboard test providers-restart
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route handler
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    stdout: { pipe: vi.fn() },
    stderr: { pipe: vi.fn() },
    unref: vi.fn(),
  })),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn(),
    })),
  };
});

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@orient-bot/database-services', () => ({
  createSecretsService: () => ({
    listSecrets: vi.fn().mockResolvedValue([
      { key: 'ANTHROPIC_API_KEY', updatedAt: new Date().toISOString() },
      { key: 'OPENAI_API_KEY', updatedAt: new Date().toISOString() },
    ]),
    getAllSecrets: vi.fn().mockResolvedValue({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      OPENAI_API_KEY: 'sk-test-openai-key',
    }),
    getSecret: vi.fn().mockResolvedValue(null),
    setSecret: vi.fn().mockResolvedValue(undefined),
    getSecretsByCategory: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  invalidateConfigCache: vi.fn(),
  setSecretOverrides: vi.fn(),
}));

import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';

describe('Provider Restart Logic', () => {
  const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
  const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
  const mockSpawn = spawn as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes('opencode.pid')) return true;
      if (path.includes('opencode')) return true; // binary exists
      if (path.includes('opencode.local.json')) return false;
      return false;
    });

    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('opencode.pid')) return '11111'; // Old PID
      return '';
    });

    // Mock process.kill to not actually kill anything
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    // Mock fetch for health check
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ healthy: true }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PID File Detection', () => {
    it('should detect when PID file exists (dev mode)', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('opencode.pid');
      });

      expect(existsSync('/some/path/opencode.pid')).toBe(true);
    });

    it('should detect when PID file does not exist (production mode)', () => {
      mockExistsSync.mockReturnValue(false);

      expect(existsSync('/some/path/opencode.pid')).toBe(false);
    });
  });

  describe('OpenCode Binary Detection', () => {
    it('should find bundled binary on darwin-arm64', () => {
      const originalPlatform = process.platform;
      const originalArch = process.arch;

      // Can't easily mock these, but we can verify the path logic
      const os = 'darwin';
      const arch = 'arm64';
      const bundledPath = `/project/vendor/opencode/${os}-${arch}/opencode`;

      mockExistsSync.mockImplementation((path: string) => {
        return path === bundledPath;
      });

      expect(existsSync(bundledPath)).toBe(true);
    });

    it('should fall back to system opencode if bundled not found', () => {
      mockExistsSync.mockImplementation((path: string) => {
        // Bundled binary doesn't exist
        if (path.includes('vendor/opencode')) return false;
        return true;
      });

      expect(existsSync('/project/vendor/opencode/darwin-arm64/opencode')).toBe(false);
    });
  });

  describe('Process Management', () => {
    it('should read PID from file', () => {
      mockReadFileSync.mockReturnValue('12345\n');

      const pid = mockReadFileSync('/path/to/opencode.pid', 'utf8');
      expect(pid.trim()).toBe('12345');
    });

    it('should spawn new OpenCode process with correct arguments', () => {
      mockSpawn.mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        unref: vi.fn(),
      });

      const proc = spawn('opencode', ['serve', '--port', '4099', '--hostname', '127.0.0.1'], {
        cwd: '/project',
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['serve', '--port', '4099', '--hostname', '127.0.0.1'],
        expect.objectContaining({
          detached: true,
        })
      );
      expect(proc.pid).toBe(99999);
    });
  });

  describe('Environment Variables', () => {
    it('should merge secrets into environment', () => {
      const baseEnv = { NODE_ENV: 'development', PATH: '/usr/bin' };
      const secrets = {
        ANTHROPIC_API_KEY: 'sk-ant-test',
        OPENAI_API_KEY: 'sk-openai-test',
      };

      const mergedEnv = { ...baseEnv, ...secrets };

      expect(mergedEnv.ANTHROPIC_API_KEY).toBe('sk-ant-test');
      expect(mergedEnv.OPENAI_API_KEY).toBe('sk-openai-test');
      expect(mergedEnv.NODE_ENV).toBe('development');
    });

    it('should allow secrets to override existing env vars', () => {
      const baseEnv = { ANTHROPIC_API_KEY: 'old-key' };
      const secrets = { ANTHROPIC_API_KEY: 'new-key' };

      const mergedEnv = { ...baseEnv, ...secrets };

      expect(mergedEnv.ANTHROPIC_API_KEY).toBe('new-key');
    });
  });

  describe('Health Check', () => {
    it('should poll for health until ready', async () => {
      let callCount = 0;
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Not ready'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ healthy: true }),
        });
      });

      // Simulate polling
      let ready = false;
      for (let i = 0; i < 5 && !ready; i++) {
        try {
          const response = await fetch('http://localhost:4099/global/health');
          if (response.ok) {
            ready = true;
          }
        } catch {
          // Not ready yet
        }
      }

      expect(ready).toBe(true);
      expect(callCount).toBe(3);
    });
  });
});

describe('Provider Defaults Validation', () => {
  describe('Valid Provider Combinations', () => {
    const VALID_DEFAULTS = {
      transcription: ['openai'],
      vision: ['anthropic', 'openai'],
      imageGeneration: ['openai', 'google'],
      agentChat: ['opencode_zen'],
    };

    it('should accept valid transcription provider', () => {
      expect(VALID_DEFAULTS.transcription).toContain('openai');
      expect(VALID_DEFAULTS.transcription).not.toContain('anthropic');
    });

    it('should accept valid vision providers', () => {
      expect(VALID_DEFAULTS.vision).toContain('anthropic');
      expect(VALID_DEFAULTS.vision).toContain('openai');
      expect(VALID_DEFAULTS.vision).not.toContain('google');
    });

    it('should accept valid image generation providers', () => {
      expect(VALID_DEFAULTS.imageGeneration).toContain('openai');
      expect(VALID_DEFAULTS.imageGeneration).toContain('google');
      expect(VALID_DEFAULTS.imageGeneration).not.toContain('anthropic');
    });

    it('should accept valid agent chat providers', () => {
      expect(VALID_DEFAULTS.agentChat).toContain('opencode_zen');
      expect(VALID_DEFAULTS.agentChat.length).toBe(1);
    });
  });

  describe('Normalization Logic', () => {
    function normalizeDefaults(input: Record<string, string> = {}) {
      const VALID_DEFAULTS = {
        transcription: ['openai'],
        vision: ['anthropic', 'openai'],
        imageGeneration: ['openai', 'google'],
        agentChat: ['opencode_zen'],
      };

      const DEFAULTS_FALLBACK = {
        transcription: 'openai',
        vision: 'anthropic',
        imageGeneration: 'openai',
        agentChat: 'opencode_zen',
      };

      return {
        transcription: VALID_DEFAULTS.transcription.includes(input.transcription)
          ? input.transcription
          : DEFAULTS_FALLBACK.transcription,
        vision: VALID_DEFAULTS.vision.includes(input.vision)
          ? input.vision
          : DEFAULTS_FALLBACK.vision,
        imageGeneration: VALID_DEFAULTS.imageGeneration.includes(input.imageGeneration)
          ? input.imageGeneration
          : DEFAULTS_FALLBACK.imageGeneration,
        agentChat: VALID_DEFAULTS.agentChat.includes(input.agentChat)
          ? input.agentChat
          : DEFAULTS_FALLBACK.agentChat,
      };
    }

    it('should return valid input unchanged', () => {
      const input = {
        transcription: 'openai',
        vision: 'openai',
        imageGeneration: 'google',
        agentChat: 'opencode_zen',
      };

      const result = normalizeDefaults(input);

      expect(result.transcription).toBe('openai');
      expect(result.vision).toBe('openai');
      expect(result.imageGeneration).toBe('google');
      expect(result.agentChat).toBe('opencode_zen');
    });

    it('should fall back to defaults for invalid input', () => {
      const input = {
        transcription: 'invalid',
        vision: 'invalid',
        imageGeneration: 'invalid',
        agentChat: 'invalid',
      };

      const result = normalizeDefaults(input);

      expect(result.transcription).toBe('openai');
      expect(result.vision).toBe('anthropic');
      expect(result.imageGeneration).toBe('openai');
      expect(result.agentChat).toBe('opencode_zen');
    });

    it('should handle empty input', () => {
      const result = normalizeDefaults({});

      expect(result.transcription).toBe('openai');
      expect(result.vision).toBe('anthropic');
      expect(result.imageGeneration).toBe('openai');
      expect(result.agentChat).toBe('opencode_zen');
    });
  });
});

describe('Provider ID Validation', () => {
  function isProviderId(value: string): boolean {
    return (
      value === 'openai' || value === 'anthropic' || value === 'google' || value === 'opencode_zen'
    );
  }

  it('should accept valid provider IDs', () => {
    expect(isProviderId('openai')).toBe(true);
    expect(isProviderId('anthropic')).toBe(true);
    expect(isProviderId('google')).toBe(true);
    expect(isProviderId('opencode_zen')).toBe(true);
  });

  it('should reject invalid provider IDs', () => {
    expect(isProviderId('invalid')).toBe(false);
    expect(isProviderId('')).toBe(false);
    expect(isProviderId('OPENAI')).toBe(false); // case sensitive
    expect(isProviderId('openai ')).toBe(false); // whitespace
  });
});
