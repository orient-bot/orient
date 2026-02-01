/**
 * Tests for Slack Bot Entry Point
 *
 * Verifies the main.ts module structure and startup logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
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
      slack: {
        bot: {
          token: 'xoxb-test-token',
          signingSecret: 'test-secret',
          appToken: 'xapp-test-token',
        },
        standupChannel: '#standup',
        defaultMode: 'bot',
      },
    },
    organization: {
      name: 'Test Org',
      jiraProjectKey: 'TEST',
    },
  }),
}));

vi.mock('@slack/bolt', () => {
  const mockExports = {
    App: class MockApp {
      client = {
        auth: {
          test: vi.fn().mockResolvedValue({ user_id: 'U123', user: 'testbot' }),
        },
      };

      async start() {
        return undefined;
      }

      async stop() {
        return undefined;
      }

      event = vi.fn();
      message = vi.fn();
    },
    LogLevel: {
      INFO: 'info',
      DEBUG: 'debug',
    },
  };
  return {
    ...mockExports,
    default: mockExports,
  };
});

vi.mock('@orient-bot/database-services', () => ({
  SlackDatabase: class MockSlackDatabase {},
  SlackChannelType: {
    GROUP: 'group',
    CHANNEL: 'channel',
    DM: 'dm',
  },
}));

vi.mock('@orient-bot/agents', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createProgressiveResponder: vi.fn(),
  };
});

describe('Slack Bot Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module Structure', () => {
    it('should export SlackConnection from services', async () => {
      const { SlackConnection } = await import('../src/services/index.js');
      expect(SlackConnection).toBeDefined();
      expect(typeof SlackConnection).toBe('function');
    });

    it('should export SlackMessaging from services', async () => {
      const { SlackMessaging } = await import('../src/services/index.js');
      expect(SlackMessaging).toBeDefined();
      expect(typeof SlackMessaging).toBe('function');
    });

    it('should export types from package', async () => {
      const types = await import('../src/types.js');
      expect(types).toBeDefined();
    });
  });

  describe('SlackBotConfig', () => {
    it('should require botToken, appToken, and signingSecret', async () => {
      const { SlackConnection } = await import('../src/services/connection.js');

      const config = {
        botToken: 'xoxb-test',
        appToken: 'xapp-test',
        signingSecret: 'secret',
      };

      const connection = new SlackConnection(config);
      expect(connection).toBeDefined();
      expect(connection.getIsConnected()).toBe(false);
    });
  });

  describe('Connection Lifecycle', () => {
    it('should connect and start the Slack app', async () => {
      const { SlackConnection } = await import('../src/services/connection.js');

      const connection = new SlackConnection({
        botToken: 'xoxb-test',
        appToken: 'xapp-test',
        signingSecret: 'secret',
      });

      await connection.connect();

      expect(connection.getIsConnected()).toBe(true);
      expect(connection.getBotUserId()).toBe('U123');
    });

    it('should handle disconnect gracefully', async () => {
      const { SlackConnection } = await import('../src/services/connection.js');

      const connection = new SlackConnection({
        botToken: 'xoxb-test',
        appToken: 'xapp-test',
        signingSecret: 'secret',
      });

      await connection.connect();
      await connection.disconnect();

      expect(connection.getIsConnected()).toBe(false);
    });

    it('should emit events on connection', async () => {
      const { SlackConnection } = await import('../src/services/connection.js');

      const connection = new SlackConnection({
        botToken: 'xoxb-test',
        appToken: 'xapp-test',
        signingSecret: 'secret',
      });

      const readyHandler = vi.fn();
      connection.on('ready', readyHandler);

      await connection.connect();

      expect(readyHandler).toHaveBeenCalled();
    });
  });
});
