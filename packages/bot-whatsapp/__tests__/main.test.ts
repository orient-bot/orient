/**
 * Tests for WhatsApp Bot Entry Point
 *
 * Verifies the main.ts module structure and startup logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@orientbot/core', () => ({
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
  createDedicatedServiceLogger: () => ({
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
      whatsapp: {
        personal: {
          enabled: true,
          adminPhone: '1234567890',
          sessionPath: './test-data/whatsapp-auth',
          autoReconnect: true,
        },
      },
    },
    organization: {
      name: 'Test Org',
      jiraProjectKey: 'TEST',
    },
  }),
}));

vi.mock('baileys', () => ({
  default: vi.fn(() => ({
    ev: {
      on: vi.fn(),
    },
  })),
  DisconnectReason: {
    loggedOut: 401,
    connectionClosed: 408,
  },
  useMultiFileAuthState: vi.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: vi.fn(),
  }),
  makeCacheableSignalKeyStore: vi.fn().mockReturnValue({}),
  fetchLatestBaileysVersion: vi
    .fn()
    .mockResolvedValue({ version: [2, 3000, 1014], isLatest: true }),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn().mockResolvedValue('QR_CODE_STRING'),
  },
  toString: vi.fn().mockResolvedValue('QR_CODE_STRING'),
}));

vi.mock('@orientbot/database-services', () => ({
  MessageDatabase: class MockMessageDatabase {},
  createMessageDatabase: vi.fn(() => ({})),
}));

vi.mock('@orientbot/agents', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createProgressiveResponder: vi.fn(),
  };
});

describe('WhatsApp Bot Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module Structure', () => {
    it('should export WhatsAppConnection from services', async () => {
      const { WhatsAppConnection } = await import('../src/services/index.js');
      expect(WhatsAppConnection).toBeDefined();
      expect(typeof WhatsAppConnection).toBe('function');
    });

    it('should export WhatsAppMessaging from services', async () => {
      const { WhatsAppMessaging } = await import('../src/services/index.js');
      expect(WhatsAppMessaging).toBeDefined();
      expect(typeof WhatsAppMessaging).toBe('function');
    });

    it('should export types from package', async () => {
      const types = await import('../src/types.js');
      // Types are TypeScript compile-time only, but we can check the module loads
      expect(types).toBeDefined();
    });
  });

  describe('WhatsAppBotConfig', () => {
    it('should support required sessionPath config', async () => {
      const { WhatsAppConnection } = await import('../src/services/connection.js');

      const config = {
        sessionPath: './test-session',
        autoReconnect: true,
      };

      const connection = new WhatsAppConnection(config);
      expect(connection).toBeDefined();
      expect(connection.getState()).toBe('connecting');
    });

    it('should support optional autoReconnect config', async () => {
      const { WhatsAppConnection } = await import('../src/services/connection.js');

      const config = {
        sessionPath: './test-session',
        autoReconnect: false,
      };

      const connection = new WhatsAppConnection(config);
      expect(connection).toBeDefined();
    });
  });

  describe('Connection Lifecycle', () => {
    it('should emit events on connection', async () => {
      const { WhatsAppConnection } = await import('../src/services/connection.js');

      const connection = new WhatsAppConnection({
        sessionPath: './test-session',
      });

      const connectedHandler = vi.fn();
      connection.on('connected', connectedHandler);

      expect(connection.isConnected()).toBe(false);
    });

    it('should handle disconnect gracefully', async () => {
      const { WhatsAppConnection } = await import('../src/services/connection.js');

      const connection = new WhatsAppConnection({
        sessionPath: './test-session',
      });

      // Should not throw
      await connection.disconnect();
      expect(connection.getState()).toBe('close');
    });
  });
});
