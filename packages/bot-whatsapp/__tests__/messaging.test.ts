/**
 * Tests for WhatsApp Messaging Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock core
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
}));

// Mock Baileys
vi.mock('baileys', () => ({
  downloadMediaMessage: vi.fn(),
}));

import { WhatsAppMessaging } from '../src/services/messaging.js';

describe('WhatsAppMessaging', () => {
  let messaging: WhatsAppMessaging;
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      sendMessage: vi.fn().mockResolvedValue({ key: { id: 'msg-123' } }),
    };
    messaging = new WhatsAppMessaging();
    messaging.setSocket(mockSocket);
  });

  describe('sendText', () => {
    it('should send a text message', async () => {
      const jid = '1234567890@s.whatsapp.net';
      const text = 'Hello, world!';

      const result = await messaging.sendText(jid, text);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(jid, { text }, { quoted: undefined });
      expect(result.key.id).toBe('msg-123');
    });
  });

  describe('sendImage', () => {
    it('should send an image with caption', async () => {
      const jid = '1234567890@s.whatsapp.net';
      const image = Buffer.from('fake-image');

      const result = await messaging.sendImage(jid, image, { caption: 'Check this out!' });

      expect(mockSocket.sendMessage).toHaveBeenCalled();
      expect(result.key.id).toBe('msg-123');
    });
  });

  describe('sendPoll', () => {
    it('should send a poll', async () => {
      const jid = '1234567890@s.whatsapp.net';
      const question = 'What should we prioritize?';
      const options = ['Feature A', 'Feature B', 'Feature C'];

      const result = await messaging.sendPoll(jid, question, options);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(jid, {
        poll: {
          name: question,
          values: options,
          selectableCount: 1,
        },
      });
      expect(result.key.id).toBe('msg-123');
    });
  });

  describe('react', () => {
    it('should react to a message', async () => {
      const jid = '1234567890@s.whatsapp.net';
      const messageId = 'original-msg-id';

      await messaging.react(jid, messageId, '👍');

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(jid, {
        react: {
          text: '👍',
          key: {
            remoteJid: jid,
            id: messageId,
            fromMe: false,
            participant: undefined,
          },
        },
      });
    });
  });

  describe('parseMessage', () => {
    it('should parse a text message', () => {
      const rawMessage = {
        key: {
          remoteJid: '1234567890@s.whatsapp.net',
          id: 'msg-123',
          fromMe: false,
        },
        message: {
          conversation: 'Hello!',
        },
        pushName: 'John',
        messageTimestamp: 1704672000,
      };

      const result = messaging.parseMessage(rawMessage);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('msg-123');
      expect(result!.text).toBe('Hello!');
      expect(result!.isGroup).toBe(false);
      expect(result!.senderName).toBe('John');
    });

    it('should parse a group message', () => {
      const rawMessage = {
        key: {
          remoteJid: '1234567890-1234567890@g.us',
          id: 'msg-456',
          participant: '9876543210@s.whatsapp.net',
          fromMe: false,
        },
        message: {
          extendedTextMessage: {
            text: 'Group message',
          },
        },
        pushName: 'Jane',
        messageTimestamp: 1704672000,
      };

      const result = messaging.parseMessage(rawMessage);

      expect(result).not.toBeNull();
      expect(result!.isGroup).toBe(true);
      expect(result!.text).toBe('Group message');
    });

    it('should parse an image message', () => {
      const rawMessage = {
        key: {
          remoteJid: '1234567890@s.whatsapp.net',
          id: 'msg-789',
          fromMe: false,
        },
        message: {
          imageMessage: {
            caption: 'Check this out!',
          },
        },
        messageTimestamp: 1704672000,
      };

      const result = messaging.parseMessage(rawMessage);

      expect(result).not.toBeNull();
      expect(result!.mediaType).toBe('image');
      expect(result!.hasMedia).toBe(true);
      expect(result!.text).toBe('Check this out!');
    });

    it('should return null for empty message', () => {
      const rawMessage = {
        key: {
          remoteJid: '1234567890@s.whatsapp.net',
          id: 'msg-000',
        },
        message: null,
      };

      const result = messaging.parseMessage(rawMessage);

      expect(result).toBeNull();
    });
  });

  describe('without socket', () => {
    it('should throw error when sending without socket', async () => {
      const noSocketMessaging = new WhatsAppMessaging();

      await expect(noSocketMessaging.sendText('1234567890@s.whatsapp.net', 'test')).rejects.toThrow(
        'WhatsApp socket not connected'
      );
    });
  });

  describe('with permission checker', () => {
    it('should deny message when permission checker returns false', async () => {
      messaging.setWritePermissionChecker(async () => false);

      await expect(messaging.sendText('1234567890@s.whatsapp.net', 'test')).rejects.toThrow(
        'Write permission denied'
      );
    });

    it('should allow message when permission checker returns true', async () => {
      messaging.setWritePermissionChecker(async () => true);

      const result = await messaging.sendText('1234567890@s.whatsapp.net', 'test');

      expect(result.key.id).toBe('msg-123');
    });
  });
});
