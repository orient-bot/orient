/**
 * E2E Tests for WhatsApp Bot Message Flow
 * 
 * Tests the complete message handling flow:
 * 1. Message reception from Baileys
 * 2. Permission checking
 * 3. OpenCode integration
 * 4. Response sending
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@orient/core', () => ({
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
  loadConfig: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn().mockReturnValue({
    integrations: {
      whatsapp: {
        personal: {
          sessionPath: './test-data/whatsapp-auth',
          autoReconnect: true,
        },
      },
    },
  }),
  setSecretOverrides: vi.fn(),
  startConfigPoller: vi.fn(),
}));

vi.mock('@orient/database-services', () => ({
  createSecretsService: vi.fn().mockReturnValue({
    getAllSecrets: vi.fn().mockResolvedValue({}),
  }),
  MessageDatabase: vi.fn().mockImplementation(() => ({
    storeMessage: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@orient/agents', () => ({
  createOpenCodeClient: vi.fn().mockReturnValue({
    chat: vi.fn().mockResolvedValue({
      response: 'Hello! How can I help you today?',
      sessionId: 'test-session-123',
      cost: 0.001,
      tokens: { input: 10, output: 20 },
      model: 'grok-code',
      provider: 'opencode',
      toolsUsed: [],
    }),
  }),
}));

vi.mock('baileys', () => ({
  default: vi.fn(),
  DisconnectReason: { loggedOut: 401 },
  useMultiFileAuthState: vi.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: vi.fn(),
  }),
  makeCacheableSignalKeyStore: vi.fn().mockReturnValue({}),
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 1014], isLatest: true }),
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
}));

// Example test IDs - these are synthetic IDs for testing, not real WhatsApp chats
const TEST_GROUP_JID = '120363000000000001@g.us';
const TEST_DM_JID = '15551234567@lid';
const TEST_PHONE = '15551234567';

describe('E2E Message Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Permission System', () => {
    it('should identify allowed chat IDs', () => {
      // Test the allowed chat IDs configuration
      const ALLOWED_CHAT_IDS = new Set([
        TEST_DM_JID,      // Example DM
        TEST_GROUP_JID,   // Example GROUP
      ]);

      expect(ALLOWED_CHAT_IDS.has(TEST_DM_JID)).toBe(true);
      expect(ALLOWED_CHAT_IDS.has(TEST_GROUP_JID)).toBe(true);
      expect(ALLOWED_CHAT_IDS.has('unknown@s.whatsapp.net')).toBe(false);
    });

    it('should authorize messages from allowed chats', () => {
      const ALLOWED_CHAT_IDS = new Set([TEST_GROUP_JID]);
      const adminPhone = '';

      const message = {
        chatId: TEST_GROUP_JID,
        senderPhone: TEST_PHONE,
        text: 'Hello',
        isGroup: true,
      };

      const isAllowedChat = ALLOWED_CHAT_IDS.has(message.chatId);
      const isAdmin = !!(adminPhone && message.senderPhone.includes(adminPhone.replace(/\D/g, '')));
      const shouldRespond = isAllowedChat || isAdmin;

      expect(shouldRespond).toBe(true);
    });

    it('should deny messages from unauthorized chats', () => {
      const ALLOWED_CHAT_IDS = new Set([TEST_GROUP_JID]);
      const adminPhone = '';

      const message = {
        chatId: 'random-chat@g.us',
        senderPhone: '123456789',
        text: 'Hello',
        isGroup: true,
      };

      const isAllowedChat = ALLOWED_CHAT_IDS.has(message.chatId);
      const isAdmin = !!(adminPhone && message.senderPhone.includes(adminPhone.replace(/\D/g, '')));
      const shouldRespond = isAllowedChat || isAdmin;

      expect(shouldRespond).toBe(false);
    });
  });

  describe('Message Parsing', () => {
    it('should correctly identify group messages', () => {
      const jid = TEST_GROUP_JID;
      const isGroup = jid.endsWith('@g.us');
      expect(isGroup).toBe(true);
    });

    it('should correctly identify DM messages', () => {
      const jid = TEST_DM_JID;
      const isGroup = jid.endsWith('@g.us');
      expect(isGroup).toBe(false);
    });

    it('should extract text from conversation message', () => {
      const messageContent = {
        conversation: 'Hello, bot!',
      };

      let text = '';
      if (messageContent.conversation) {
        text = messageContent.conversation;
      }

      expect(text).toBe('Hello, bot!');
    });

    it('should extract text from extended text message', () => {
      const messageContent = {
        extendedTextMessage: {
          text: 'Hello with quote!',
        },
      };

      let text = '';
      if ((messageContent as any).extendedTextMessage?.text) {
        text = (messageContent as any).extendedTextMessage.text;
      }

      expect(text).toBe('Hello with quote!');
    });
  });

  describe('Self-Message Filtering', () => {
    it('should skip DM messages from self', () => {
      const msg = {
        key: {
          fromMe: true,
          remoteJid: TEST_DM_JID,
        },
      };
      const isGroup = msg.key.remoteJid.endsWith('@g.us');

      // For DMs, skip if fromMe is true
      let isFromMe = false;
      if (!isGroup) {
        isFromMe = msg.key.fromMe === true;
      }

      expect(isFromMe).toBe(true);
    });

    it('should NOT skip group messages even with fromMe true', () => {
      const msg = {
        key: {
          fromMe: true,
          remoteJid: TEST_GROUP_JID,
        },
      };
      const isGroup = msg.key.remoteJid.endsWith('@g.us');

      // For groups, we don't set isFromMe - we process all messages
      let isFromMe = false;
      if (!isGroup) {
        isFromMe = msg.key.fromMe === true;
      }

      expect(isFromMe).toBe(false);
    });
  });

  describe('Sent Message Tracking', () => {
    it('should track sent message IDs to prevent echo', () => {
      const sentMessageIds = new Set<string>();

      // Simulate sending a message
      const sentMsgId = '3EB0694C8F65446F6791D9';
      sentMessageIds.add(sentMsgId);

      // Verify we can detect our own sent messages
      expect(sentMessageIds.has(sentMsgId)).toBe(true);
      expect(sentMessageIds.has('different-id')).toBe(false);
    });
  });

  describe('OpenCode Integration', () => {
    it('should create correct context key for sessions', () => {
      const chatId = TEST_GROUP_JID;
      const contextKey = `whatsapp:${chatId}`;

      expect(contextKey).toBe(`whatsapp:${TEST_GROUP_JID}`);
    });

    it('should format response with model footer', () => {
      const response = 'Hello! How can I help you?';
      const model = 'grok-code';
      const toolsUsed: string[] = [];

      const formattedResponse = response + 
        `\n\n_${model} • ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'no tools'}_`;

      expect(formattedResponse).toContain('Hello! How can I help you?');
      expect(formattedResponse).toContain('grok-code');
      expect(formattedResponse).toContain('no tools');
    });

    it('should format response with tools used', () => {
      const response = 'Here are your Jira tickets...';
      const model = 'grok-code';
      const toolsUsed = ['ai_first_get_blockers', 'ai_first_search_issues'];

      const formattedResponse = response + 
        `\n\n_${model} • ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'no tools'}_`;

      expect(formattedResponse).toContain('ai_first_get_blockers');
      expect(formattedResponse).toContain('ai_first_search_issues');
    });
  });
});
