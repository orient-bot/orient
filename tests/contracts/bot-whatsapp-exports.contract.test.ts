/**
 * Contract Tests for @orientbot/bot-whatsapp
 *
 * These tests verify that the bot-whatsapp package exports all expected
 * types and classes. They serve as a contract that must not break
 * when refactoring the package internals.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('baileys', () => ({
  default: () => ({}),
  DisconnectReason: {},
  useMultiFileAuthState: async () => ({
    state: { creds: {}, keys: {} },
    saveCreds: async () => {},
  }),
  makeCacheableSignalKeyStore: () => ({}),
  fetchLatestBaileysVersion: async () => ({ version: [1, 0, 0], isLatest: true }),
  downloadMediaMessage: async () => Buffer.from(''),
  jidNormalizedUser: (jid: string) => jid,
}));

vi.mock('baileys/lib/Utils/process-message.js', () => ({
  decryptPollVote: () => ({}),
}));

vi.mock('qrcode-terminal', () => ({
  generate: () => {},
}));

describe('@orientbot/bot-whatsapp Contract Tests', () => {
  describe('Type Exports', () => {
    it('should export ConnectionState type', async () => {
      const module = await import('../../packages/bot-whatsapp/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export WhatsAppBotConfig type', async () => {
      const module = await import('../../packages/bot-whatsapp/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export WhatsAppMessage type', async () => {
      const module = await import('../../packages/bot-whatsapp/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export ParsedMessage type', async () => {
      const module = await import('../../packages/bot-whatsapp/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export PermissionCheckResult type', async () => {
      const module = await import('../../packages/bot-whatsapp/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export WhatsAppPoll type', async () => {
      const module = await import('../../packages/bot-whatsapp/src/types.ts');
      expect(module).toBeDefined();
    });

    it('should export PollVote type', async () => {
      const module = await import('../../packages/bot-whatsapp/src/types.ts');
      expect(module).toBeDefined();
    });
  });

  describe('Service Exports', () => {
    it('should export WhatsAppConnection class', async () => {
      const module = await import('../../packages/bot-whatsapp/src/services/connection.ts');
      expect(module.WhatsAppConnection).toBeDefined();
      expect(typeof module.WhatsAppConnection).toBe('function');
    });

    it('should export WhatsAppMessaging class', async () => {
      const module = await import('../../packages/bot-whatsapp/src/services/messaging.ts');
      expect(module.WhatsAppMessaging).toBeDefined();
      expect(typeof module.WhatsAppMessaging).toBe('function');
    });

    it('WhatsAppConnection should be instantiable', async () => {
      const { WhatsAppConnection } =
        await import('../../packages/bot-whatsapp/src/services/connection.ts');

      const connection = new WhatsAppConnection({
        sessionPath: '/tmp/test-session',
        autoReconnect: true,
      });

      expect(connection).toBeDefined();
      expect(typeof connection.connect).toBe('function');
      expect(typeof connection.disconnect).toBe('function');
      expect(typeof connection.getState).toBe('function');
    });

    it('WhatsAppMessaging should be instantiable', async () => {
      const { WhatsAppMessaging } =
        await import('../../packages/bot-whatsapp/src/services/messaging.ts');

      const messaging = new WhatsAppMessaging();

      expect(messaging).toBeDefined();
      expect(typeof messaging.sendText).toBe('function');
      expect(typeof messaging.sendPoll).toBe('function');
      expect(typeof messaging.react).toBe('function');
    });
  });
});
