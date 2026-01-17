/**
 * Tests for Slack Messaging Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock core
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
}));

import { SlackMessaging } from '../src/services/messaging.js';

describe('SlackMessaging', () => {
  let messaging: SlackMessaging;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234567890.123456', channel: 'C123' }),
        update: vi.fn().mockResolvedValue({ ok: true, ts: '1234567890.123456', channel: 'C123' }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
      conversations: {
        open: vi.fn().mockResolvedValue({ ok: true, channel: { id: 'D123' } }),
      },
      reactions: {
        add: vi.fn().mockResolvedValue({ ok: true }),
      },
      users: {
        info: vi.fn().mockResolvedValue({
          ok: true,
          user: {
            id: 'U123',
            name: 'testuser',
            real_name: 'Test User',
            profile: {
              display_name: 'Test',
              email: 'test@example.com',
              image_72: 'https://example.com/avatar.png',
            },
            is_bot: false,
          },
        }),
        lookupByEmail: vi.fn().mockResolvedValue({
          ok: true,
          user: {
            id: 'U456',
            name: 'emailuser',
            profile: {
              display_name: 'Email User',
              email: 'email@example.com',
            },
          },
        }),
      },
    };
    messaging = new SlackMessaging();
    messaging.setClient(mockClient);
  });

  describe('postMessage', () => {
    it('should post a message to a channel', async () => {
      const result = await messaging.postMessage('C123', 'Hello, world!');

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123',
        text: 'Hello, world!',
        thread_ts: undefined,
        blocks: undefined,
        unfurl_links: false,
        unfurl_media: true,
      });
      expect(result.ts).toBe('1234567890.123456');
      expect(result.channel).toBe('C123');
    });

    it('should post a message with blocks', async () => {
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello!' } }];
      
      await messaging.postMessage('C123', 'Hello!', { blocks });

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ blocks })
      );
    });
  });

  describe('postThreadReply', () => {
    it('should post a reply in a thread', async () => {
      const result = await messaging.postThreadReply('C123', '1234567890.000000', 'Reply text');

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123',
          text: 'Reply text',
          thread_ts: '1234567890.000000',
        })
      );
      expect(result.ts).toBeDefined();
    });
  });

  describe('sendDirectMessage', () => {
    it('should open a DM channel and send a message', async () => {
      const result = await messaging.sendDirectMessage('U123', 'DM text');

      expect(mockClient.conversations.open).toHaveBeenCalledWith({ users: 'U123' });
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'D123',
          text: 'DM text',
        })
      );
      expect(result.ts).toBeDefined();
    });
  });

  describe('addReaction', () => {
    it('should add a reaction to a message', async () => {
      await messaging.addReaction('C123', '1234567890.123456', 'thumbsup');

      expect(mockClient.reactions.add).toHaveBeenCalledWith({
        channel: 'C123',
        timestamp: '1234567890.123456',
        name: 'thumbsup',
      });
    });
  });

  describe('updateMessage', () => {
    it('should update a message', async () => {
      const result = await messaging.updateMessage('C123', '1234567890.123456', 'Updated text');

      expect(mockClient.chat.update).toHaveBeenCalledWith({
        channel: 'C123',
        ts: '1234567890.123456',
        text: 'Updated text',
        blocks: undefined,
      });
      expect(result.ts).toBeDefined();
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message', async () => {
      await messaging.deleteMessage('C123', '1234567890.123456');

      expect(mockClient.chat.delete).toHaveBeenCalledWith({
        channel: 'C123',
        ts: '1234567890.123456',
      });
    });
  });

  describe('getUserInfo', () => {
    it('should get user info', async () => {
      const result = await messaging.getUserInfo('U123');

      expect(mockClient.users.info).toHaveBeenCalledWith({ user: 'U123' });
      expect(result).toEqual({
        id: 'U123',
        name: 'testuser',
        displayName: 'Test',
        email: 'test@example.com',
        avatarUrl: 'https://example.com/avatar.png',
        isBot: false,
      });
    });
  });

  describe('lookupUserByEmail', () => {
    it('should look up a user by email', async () => {
      const result = await messaging.lookupUserByEmail('email@example.com');

      expect(mockClient.users.lookupByEmail).toHaveBeenCalledWith({ email: 'email@example.com' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('U456');
    });
  });

  describe('without client', () => {
    it('should throw error when posting without client', async () => {
      const noClientMessaging = new SlackMessaging();

      await expect(
        noClientMessaging.postMessage('C123', 'test')
      ).rejects.toThrow('Slack client not connected');
    });
  });
});
