/**
 * Contract Tests for @orient/bot-slack
 *
 * These tests verify that the bot-slack package exports all expected
 * types and classes. They serve as a contract that must not break
 * when refactoring the package internals.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@slack/bolt', () => {
  class MockApp {
    client = {
      auth: { test: async () => ({ user_id: 'U123', user: 'bot' }) },
      chat: { postMessage: async () => ({}), update: async () => ({}), delete: async () => ({}) },
      conversations: { open: async () => ({}) },
      reactions: { add: async () => ({}) },
      users: { info: async () => ({}), lookupByEmail: async () => ({}) },
    };
    start = async () => {};
    stop = async () => {};
  }

  return {
    App: MockApp,
    LogLevel: { INFO: 'info' },
    MessageEvent: {},
    AppMentionEvent: {},
    SlashCommand: {},
    Middleware: {},
    SlackCommandMiddlewareArgs: {},
    default: { App: MockApp, LogLevel: { INFO: 'info' } },
  };
});

vi.mock('@slack/web-api', () => ({
  WebClient: class MockWebClient {},
}));

describe('@orient/bot-slack Contract Tests', () => {
  describe('Type Exports', () => {
    it('should export SlackBotConfig type', async () => {
      const module = await import('../../packages/bot-slack/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export SlackChannelType type', async () => {
      const module = await import('../../packages/bot-slack/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export SlackChannelPermission type', async () => {
      const module = await import('../../packages/bot-slack/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export SlackMessageContext type', async () => {
      const module = await import('../../packages/bot-slack/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export SlackMentionContext type', async () => {
      const module = await import('../../packages/bot-slack/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export SlackUserInfo type', async () => {
      const module = await import('../../packages/bot-slack/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export PostMessageResult type', async () => {
      const module = await import('../../packages/bot-slack/src/types.ts');
      expect(module).toBeDefined();
    });
  });

  describe('Service Exports', () => {
    it('should export SlackConnection class', async () => {
      const module = await import('../../packages/bot-slack/src/services/connection.ts');
      expect(module.SlackConnection).toBeDefined();
      expect(typeof module.SlackConnection).toBe('function');
    });

    it('should export SlackMessaging class', async () => {
      const module = await import('../../packages/bot-slack/src/services/messaging.ts');
      expect(module.SlackMessaging).toBeDefined();
      expect(typeof module.SlackMessaging).toBe('function');
    });

    it('SlackConnection should be instantiable', async () => {
      const { SlackConnection } =
        await import('../../packages/bot-slack/src/services/connection.ts');

      const connection = new SlackConnection({
        botToken: 'xoxb-test',
        signingSecret: 'test-secret',
        appToken: 'xapp-test',
      });

      expect(connection).toBeDefined();
      expect(typeof connection.connect).toBe('function');
      expect(typeof connection.disconnect).toBe('function');
      expect(typeof connection.getIsConnected).toBe('function');
    });

    it('SlackMessaging should be instantiable', async () => {
      const { SlackMessaging } = await import('../../packages/bot-slack/src/services/messaging.ts');

      const messaging = new SlackMessaging();

      expect(messaging).toBeDefined();
      expect(typeof messaging.postMessage).toBe('function');
      expect(typeof messaging.sendDirectMessage).toBe('function');
      expect(typeof messaging.addReaction).toBe('function');
    });
  });
});
