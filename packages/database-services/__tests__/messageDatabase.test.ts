/**
 * Tests for Message Database Service
 *
 * Tests for message storage, retrieval, permissions, and system prompts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create module-level mocks
const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();
const mockClient = {
  query: vi.fn(),
  release: mockRelease,
};

vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockQuery;
      connect = mockConnect;
      end = vi.fn();
      on = vi.fn();
    },
  },
}));

vi.mock('@orient/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { MessageDatabase, createMessageDatabase } from '../src/messageDatabase.js';

describe('MessageDatabase', () => {
  let db: MessageDatabase;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockConnect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

    db = new MessageDatabase();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Constructor', () => {
    it('should use provided connection string', () => {
      const customDb = new MessageDatabase('postgresql://custom:custom@localhost:5432/custom');
      expect(customDb).toBeDefined();
    });

    it('should use DATABASE_URL environment variable', () => {
      process.env.DATABASE_URL = 'postgresql://env:env@localhost:5432/env';
      const envDb = new MessageDatabase();
      expect(envDb).toBeDefined();
    });

    it('should use default connection string when none provided', () => {
      delete process.env.DATABASE_URL;
      const defaultDb = new MessageDatabase();
      expect(defaultDb).toBeDefined();
    });
  });

  describe('Message Storage', () => {
    describe('storeIncomingMessage', () => {
      it('should store incoming message with correct parameters', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

        const id = await db.storeIncomingMessage(
          'msg-123',
          'jid@s.whatsapp.net',
          '1234567890',
          'Hello world',
          new Date('2024-01-01T12:00:00Z'),
          false
        );

        expect(id).toBe(1);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO messages'),
          expect.arrayContaining([
            'msg-123',
            'incoming',
            'jid@s.whatsapp.net',
            '1234567890',
            'Hello world',
            false,
          ])
        );
      });

      it('should store incoming group message', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }], rowCount: 1 });

        const id = await db.storeIncomingMessage(
          'msg-456',
          'jid@g.us',
          '1234567890',
          'Group message',
          new Date('2024-01-01T12:00:00Z'),
          true,
          'group-123@g.us'
        );

        expect(id).toBe(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO messages'),
          expect.arrayContaining(['group-123@g.us'])
        );
      });

      it('should handle media messages', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }], rowCount: 1 });

        const id = await db.storeIncomingMessage(
          'msg-789',
          'jid@s.whatsapp.net',
          '1234567890',
          'Image caption',
          new Date(),
          false,
          undefined,
          {
            mediaType: 'image',
            mediaPath: '/path/to/image.jpg',
            mediaMimeType: 'image/jpeg',
          }
        );

        expect(id).toBe(3);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO messages'),
          expect.arrayContaining(['image', '/path/to/image.jpg', 'image/jpeg'])
        );
      });

      it('should return 0 for duplicate message_id', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const id = await db.storeIncomingMessage(
          'duplicate-msg',
          'jid@s.whatsapp.net',
          '1234567890',
          'Duplicate',
          new Date(),
          false
        );

        expect(id).toBe(0);
      });
    });

    describe('storeOutgoingMessage', () => {
      it('should store outgoing message', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 4 }], rowCount: 1 });

        const id = await db.storeOutgoingMessage(
          'out-msg-123',
          'jid@s.whatsapp.net',
          '1234567890',
          'Response message',
          false
        );

        expect(id).toBe(4);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO messages'),
          expect.arrayContaining(['out-msg-123', 'outgoing'])
        );
      });
    });
  });

  describe('Message Retrieval', () => {
    const sampleMessages = [
      {
        id: 1,
        message_id: 'msg-1',
        direction: 'incoming',
        jid: 'jid1@s.whatsapp.net',
        phone: '1234567890',
        text: 'Hello',
        is_group: false,
        timestamp: '2024-01-01T12:00:00Z',
      },
      {
        id: 2,
        message_id: 'msg-2',
        direction: 'outgoing',
        jid: 'jid1@s.whatsapp.net',
        phone: '1234567890',
        text: 'Hi there',
        is_group: false,
        timestamp: '2024-01-01T12:01:00Z',
      },
    ];

    describe('searchMessages', () => {
      it('should search messages by phone number', async () => {
        mockQuery.mockResolvedValueOnce({ rows: sampleMessages, rowCount: 2 });

        const results = await db.searchMessages({ phone: '1234567890' });

        expect(results).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('phone = $1'),
          expect.arrayContaining(['1234567890'])
        );
      });

      it('should search messages by direction', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [sampleMessages[0]], rowCount: 1 });

        const results = await db.searchMessages({ direction: 'incoming' });

        expect(results).toHaveLength(1);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('direction = $'),
          expect.arrayContaining(['incoming'])
        );
      });

      it('should search messages by date range', async () => {
        mockQuery.mockResolvedValueOnce({ rows: sampleMessages, rowCount: 2 });

        const fromDate = new Date('2024-01-01');
        const toDate = new Date('2024-01-02');

        const results = await db.searchMessages({ fromDate, toDate });

        expect(results).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('timestamp >='),
          expect.arrayContaining([fromDate.toISOString(), toDate.toISOString()])
        );
      });

      it('should search messages by text content', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [sampleMessages[0]], rowCount: 1 });

        const results = await db.searchMessages({ text: 'Hello' });

        expect(results).toHaveLength(1);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('to_tsvector'),
          expect.arrayContaining(['Hello'])
        );
      });

      it('should apply pagination', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.searchMessages({ limit: 10, offset: 20 });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT'),
          expect.arrayContaining([10, 20])
        );
      });
    });

    describe('getMessagesByPhone', () => {
      it('should retrieve messages for a specific phone number', async () => {
        mockQuery.mockResolvedValueOnce({ rows: sampleMessages, rowCount: 2 });

        const results = await db.getMessagesByPhone('1234567890');

        expect(results).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE phone = $1'), [
          '1234567890',
          100,
        ]);
      });

      it('should respect limit parameter', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [sampleMessages[0]], rowCount: 1 });

        await db.getMessagesByPhone('1234567890', 50);

        expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['1234567890', 50]);
      });
    });

    describe('getMessagesByGroup', () => {
      it('should retrieve messages for a specific group', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await db.getMessagesByGroup('group-123@g.us');

        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE group_id = $1'), [
          'group-123@g.us',
          100,
        ]);
      });
    });

    describe('getMessagesByDateRange', () => {
      it('should retrieve messages within date range', async () => {
        mockQuery.mockResolvedValueOnce({ rows: sampleMessages, rowCount: 2 });

        const fromDate = new Date('2024-01-01');
        const toDate = new Date('2024-01-02');

        const results = await db.getMessagesByDateRange(fromDate, toDate);

        expect(results).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('timestamp >= $1 AND timestamp <= $2'),
          [fromDate.toISOString(), toDate.toISOString(), 500]
        );
      });
    });

    describe('getMessageById', () => {
      it('should retrieve a specific message by ID', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [sampleMessages[0]], rowCount: 1 });

        const result = await db.getMessageById('msg-1');

        expect(result).toBeDefined();
        expect(result?.message_id).toBe('msg-1');
      });

      it('should return undefined for non-existent message', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await db.getMessageById('nonexistent');

        expect(result).toBeUndefined();
      });
    });

    describe('getRecentMessages', () => {
      it('should retrieve recent messages', async () => {
        mockQuery.mockResolvedValueOnce({ rows: sampleMessages, rowCount: 2 });

        const results = await db.getRecentMessages(50);

        expect(results).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY timestamp DESC'),
          [50]
        );
      });
    });
  });

  describe('Statistics', () => {
    describe('getStats', () => {
      it('should return database statistics', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // total
          .mockResolvedValueOnce({ rows: [{ count: '60' }] }) // incoming
          .mockResolvedValueOnce({ rows: [{ count: '40' }] }) // outgoing
          .mockResolvedValueOnce({ rows: [{ count: '15' }] }) // contacts
          .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // groups
          .mockResolvedValueOnce({ rows: [{ ts: new Date('2024-01-01') }] }) // first
          .mockResolvedValueOnce({ rows: [{ ts: new Date('2024-01-31') }] }); // last

        const stats = await db.getStats();

        expect(stats.totalMessages).toBe(100);
        expect(stats.incomingMessages).toBe(60);
        expect(stats.outgoingMessages).toBe(40);
        expect(stats.uniqueContacts).toBe(15);
        expect(stats.uniqueGroups).toBe(5);
      });
    });

    describe('getMediaStats', () => {
      it('should return media statistics', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            { media_type: 'image', count: '50' },
            { media_type: 'audio', count: '20' },
            { media_type: 'video', count: '10' },
            { media_type: 'document', count: '5' },
          ],
        });

        const stats = await db.getMediaStats();

        expect(stats.imageCount).toBe(50);
        expect(stats.audioCount).toBe(20);
        expect(stats.videoCount).toBe(10);
        expect(stats.documentCount).toBe(5);
      });

      it('should return 0 for missing media types', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ media_type: 'image', count: '50' }],
        });

        const stats = await db.getMediaStats();

        expect(stats.imageCount).toBe(50);
        expect(stats.audioCount).toBe(0);
        expect(stats.videoCount).toBe(0);
        expect(stats.documentCount).toBe(0);
      });
    });
  });

  describe('Group Management', () => {
    describe('upsertGroup', () => {
      it('should insert or update group metadata', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.upsertGroup('group-123@g.us', 'Test Group', 'Group Subject', 10);

        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO groups'), [
          'group-123@g.us',
          'Test Group',
          'Group Subject',
          10,
        ]);
      });
    });

    describe('getGroup', () => {
      it('should retrieve group by ID', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              group_id: 'group-123@g.us',
              group_name: 'Test Group',
              group_subject: 'Subject',
              participant_count: 10,
            },
          ],
        });

        const group = await db.getGroup('group-123@g.us');

        expect(group).toBeDefined();
        expect(group?.group_name).toBe('Test Group');
      });

      it('should return undefined for non-existent group', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const group = await db.getGroup('nonexistent');

        expect(group).toBeUndefined();
      });
    });

    describe('searchGroups', () => {
      it('should search groups by name or subject', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ group_id: 'group-1', group_name: 'Family Group' }],
        });

        const results = await db.searchGroups('Family');

        expect(results).toHaveLength(1);
        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), ['%Family%']);
      });
    });
  });

  describe('Chat Permissions', () => {
    describe('getChatPermission', () => {
      it('should retrieve chat permission', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              chatId: 'chat-123',
              chatType: 'individual',
              permission: 'read_write',
              displayName: 'John Doe',
            },
          ],
        });

        const permission = await db.getChatPermission('chat-123');

        expect(permission).toBeDefined();
        expect(permission?.permission).toBe('read_write');
      });

      it('should return undefined for chat without permission', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const permission = await db.getChatPermission('unknown-chat');

        expect(permission).toBeUndefined();
      });
    });

    describe('setChatPermission', () => {
      it('should set chat permission and create audit log', async () => {
        // First call: getChatPermission check
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        // Second call: INSERT/UPDATE
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // Third call: audit log
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.setChatPermission(
          'chat-123',
          'individual',
          'read_write',
          'John Doe',
          'Test notes',
          'admin'
        );

        expect(mockQuery).toHaveBeenCalledTimes(3);
        expect(mockQuery).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('INSERT INTO chat_permissions'),
          expect.arrayContaining(['chat-123', 'individual', 'read_write'])
        );
        expect(mockQuery).toHaveBeenNthCalledWith(
          3,
          expect.stringContaining('INSERT INTO permission_audit_log'),
          expect.arrayContaining(['chat-123', null, 'read_write', 'admin'])
        );
      });

      it('should not create audit log if permission unchanged', async () => {
        // Return existing permission
        mockQuery.mockResolvedValueOnce({
          rows: [{ permission: 'read_write' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.setChatPermission('chat-123', 'individual', 'read_write');

        // Should only call getChatPermission and INSERT, no audit log
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });
    });

    describe('deleteChatPermission', () => {
      it('should delete permission and create audit log', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ permission: 'read_write' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const deleted = await db.deleteChatPermission('chat-123', 'admin');

        expect(deleted).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM chat_permissions'),
          ['chat-123']
        );
      });

      it('should return false for non-existent permission', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const deleted = await db.deleteChatPermission('unknown-chat');

        expect(deleted).toBe(false);
      });
    });
  });

  describe('System Prompts', () => {
    describe('getSystemPrompt', () => {
      it('should return chat-specific prompt when exists', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              chatId: 'chat-123',
              platform: 'whatsapp',
              promptText: 'Custom prompt',
              isActive: true,
            },
          ],
        });

        const prompt = await db.getSystemPrompt('whatsapp', 'chat-123');

        expect(prompt).toBeDefined();
        expect(prompt?.promptText).toBe('Custom prompt');
      });

      it('should fall back to platform default when no chat-specific prompt', async () => {
        // First query: specific chat - not found
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        // Second query: platform default
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              chatId: '*',
              platform: 'whatsapp',
              promptText: 'Default prompt',
              isActive: true,
            },
          ],
        });

        const prompt = await db.getSystemPrompt('whatsapp', 'unknown-chat');

        expect(prompt).toBeDefined();
        expect(prompt?.chatId).toBe('*');
        expect(prompt?.promptText).toBe('Default prompt');
      });

      it('should return undefined when no prompts exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const prompt = await db.getSystemPrompt('whatsapp', 'chat-123');

        expect(prompt).toBeUndefined();
      });
    });

    describe('setSystemPrompt', () => {
      it('should create or update system prompt', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              chatId: 'chat-123',
              platform: 'whatsapp',
              promptText: 'New prompt',
              isActive: true,
            },
          ],
        });

        const result = await db.setSystemPrompt('whatsapp', 'chat-123', 'New prompt');

        expect(result.promptText).toBe('New prompt');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO system_prompts'),
          ['chat-123', 'whatsapp', 'New prompt']
        );
      });
    });

    describe('deleteSystemPrompt', () => {
      it('should delete custom prompt', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const deleted = await db.deleteSystemPrompt('whatsapp', 'chat-123');

        expect(deleted).toBe(true);
      });

      it('should not delete platform default prompt', async () => {
        const deleted = await db.deleteSystemPrompt('whatsapp', '*');

        expect(deleted).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
      });
    });
  });

  describe('Health Monitor State', () => {
    describe('getHealthMonitorState', () => {
      it('should retrieve state value', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ value: 'connected' }],
        });

        const value = await db.getHealthMonitorState('connection_status');

        expect(value).toBe('connected');
      });

      it('should return null for non-existent key', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const value = await db.getHealthMonitorState('unknown_key');

        expect(value).toBeNull();
      });
    });

    describe('setHealthMonitorState', () => {
      it('should set state value', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await db.setHealthMonitorState('connection_status', 'connected');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO health_monitor_state'),
          ['connection_status', 'connected']
        );
      });
    });
  });

  describe('Utility Functions', () => {
    describe('createMessageDatabase', () => {
      it('should create a MessageDatabase instance', () => {
        const database = createMessageDatabase('postgresql://test:test@localhost:5432/test');
        expect(database).toBeInstanceOf(MessageDatabase);
      });
    });

    describe('close', () => {
      it('should close database connection pool', async () => {
        await db.close();
        // No error thrown means success
      });
    });

    describe('deleteOldMessages', () => {
      it('should delete messages older than specified days', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 50 });

        const deleted = await db.deleteOldMessages(30);

        expect(deleted).toBe(50);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM messages'),
          expect.any(Array)
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should propagate database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(db.searchMessages({})).rejects.toThrow('Connection refused');
    });
  });
});
