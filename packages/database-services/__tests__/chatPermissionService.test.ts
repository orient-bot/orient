/**
 * Chat Permission Service Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChatPermissionService,
  createChatPermissionService,
  type ChatPermissionDatabaseInterface,
  type ChatPermissionServiceConfig,
} from '../src/chatPermissionService.js';
import type { ChatPermissionRecord, ChatPermission, ChatType } from '../src/types/index.js';

// Mock database implementation
function createMockDb(): ChatPermissionDatabaseInterface {
  const permissions = new Map<string, ChatPermissionRecord>();
  const groups = new Map<string, { group_name: string | null; participant_count: number | null }>();
  
  return {
    async getChatPermission(chatId: string) {
      return permissions.get(chatId);
    },
    
    async setChatPermission(
      chatId: string,
      chatType: ChatType,
      permission: ChatPermission,
      displayName?: string,
      notes?: string,
      changedBy?: string
    ) {
      permissions.set(chatId, {
        chatId,
        chatType,
        permission,
        displayName,
        notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    
    async getAllChatPermissions() {
      return Array.from(permissions.values());
    },
    
    async migrateFromAllowedGroupIds(allowedGroupIds: string[], defaultPermission: ChatPermission) {
      return allowedGroupIds.length;
    },
    
    async getGroup(chatId: string) {
      return groups.get(chatId);
    },
    
    // Helper for tests
    _setGroup(chatId: string, group: { group_name: string | null; participant_count: number | null }) {
      groups.set(chatId, group);
    },
  } as ChatPermissionDatabaseInterface & { _setGroup: (chatId: string, group: { group_name: string | null; participant_count: number | null }) => void };
}

describe('ChatPermissionService', () => {
  let mockDb: ChatPermissionDatabaseInterface;
  let config: ChatPermissionServiceConfig;
  let service: ChatPermissionService;

  beforeEach(() => {
    mockDb = createMockDb();
    config = {
      defaultPermission: 'read_only',
      adminPhone: '+1234567890',
    };
    service = createChatPermissionService(mockDb, config);
  });

  describe('checkWritePermission', () => {
    it('should deny write when no permission exists', async () => {
      const result = await service.checkWritePermission('test-chat@s.whatsapp.net');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No explicit permission');
    });

    it('should deny write when permission is read_only', async () => {
      await mockDb.setChatPermission('test-chat@s.whatsapp.net', 'individual', 'read_only');
      const result = await service.checkWritePermission('test-chat@s.whatsapp.net');
      expect(result.allowed).toBe(false);
      expect(result.permission).toBe('read_only');
    });

    it('should allow write when permission is read_write', async () => {
      await mockDb.setChatPermission('test-chat@s.whatsapp.net', 'individual', 'read_write');
      const result = await service.checkWritePermission('test-chat@s.whatsapp.net');
      expect(result.allowed).toBe(true);
      expect(result.permission).toBe('read_write');
    });
  });

  describe('checkPermission', () => {
    it('should return database permission when set', async () => {
      await mockDb.setChatPermission('test-chat@s.whatsapp.net', 'individual', 'read_write');
      const result = await service.checkPermission('test-chat@s.whatsapp.net', false, '1234567890');
      expect(result.permission).toBe('read_write');
      expect(result.source).toBe('database');
      expect(result.shouldStore).toBe(true);
      expect(result.shouldRespond).toBe(true);
    });

    it('should not store messages when permission is ignored', async () => {
      await mockDb.setChatPermission('test-chat@s.whatsapp.net', 'individual', 'ignored');
      const result = await service.checkPermission('test-chat@s.whatsapp.net', false, '1234567890');
      expect(result.permission).toBe('ignored');
      expect(result.shouldStore).toBe(false);
      expect(result.shouldRespond).toBe(false);
    });
  });

  describe('setPermission', () => {
    it('should set permission and invalidate cache', async () => {
      await service.setPermission('test-chat@s.whatsapp.net', 'individual', 'read_write', 'Test Chat');
      const permissions = await service.getAllPermissions();
      expect(permissions.length).toBe(1);
      expect(permissions[0].permission).toBe('read_write');
    });
  });
});
