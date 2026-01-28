/**
 * Prompt Service Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptService, createPromptService } from '../src/services/promptService.js';
import type { PromptDatabaseInterface, PromptPlatform, SystemPromptRecord } from '../src/types.js';

// Mock database implementation
function createMockDb(): PromptDatabaseInterface {
  const prompts = new Map<string, SystemPromptRecord>();

  return {
    async getSystemPromptText(platform: PromptPlatform, chatId: string) {
      const key = `${platform}:${chatId}`;
      const record = prompts.get(key);
      if (record) return record.promptText;

      // Check for platform default
      const defaultKey = `${platform}:*`;
      const defaultRecord = prompts.get(defaultKey);
      return defaultRecord?.promptText;
    },

    async getSystemPrompt(platform: PromptPlatform, chatId: string) {
      const key = `${platform}:${chatId}`;
      return prompts.get(key);
    },

    async setSystemPrompt(platform: PromptPlatform, chatId: string, promptText: string) {
      const key = `${platform}:${chatId}`;
      const record: SystemPromptRecord = {
        id: prompts.size + 1,
        chatId,
        platform,
        promptText,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      prompts.set(key, record);
      return record;
    },

    async deleteSystemPrompt(platform: PromptPlatform, chatId: string) {
      const key = `${platform}:${chatId}`;
      return prompts.delete(key);
    },

    async getDefaultPrompt(platform: PromptPlatform) {
      return prompts.get(`${platform}:*`);
    },

    async getDefaultPrompts() {
      return {
        whatsapp: prompts.get('whatsapp:*'),
        slack: prompts.get('slack:*'),
      };
    },

    async listSystemPrompts(platform?: PromptPlatform) {
      const result = [];
      for (const [key, record] of prompts) {
        if (!platform || key.startsWith(`${platform}:`)) {
          result.push({
            ...record,
            isDefault: record.chatId === '*',
          });
        }
      }
      return result;
    },

    async seedDefaultPrompts() {
      // No-op for tests
    },
  };
}

describe('PromptService', () => {
  let mockDb: PromptDatabaseInterface;
  let service: PromptService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = createPromptService(mockDb, { cacheEnabled: false });
  });

  describe('getPromptForChat', () => {
    it('should return embedded default when no database prompt exists', async () => {
      const prompt = await service.getPromptForChat('whatsapp', 'test-chat');
      expect(prompt).toContain('Ori');
    });

    it('should return custom prompt when set', async () => {
      await mockDb.setSystemPrompt('whatsapp', 'test-chat', 'Custom prompt');
      const prompt = await service.getPromptForChat('whatsapp', 'test-chat');
      expect(prompt).toBe('Custom prompt');
    });

    it('should return platform default when available', async () => {
      await mockDb.setSystemPrompt('slack', '*', 'Slack default prompt');
      const prompt = await service.getPromptForChat('slack', 'channel-123');
      expect(prompt).toBe('Slack default prompt');
    });
  });

  describe('setPrompt', () => {
    it('should set a custom prompt', async () => {
      const result = await service.setPrompt('whatsapp', 'chat-123', 'My custom prompt');
      expect(result.promptText).toBe('My custom prompt');
      expect(result.chatId).toBe('chat-123');
      expect(result.platform).toBe('whatsapp');
    });
  });

  describe('deletePrompt', () => {
    it('should delete a custom prompt', async () => {
      await service.setPrompt('whatsapp', 'chat-123', 'Custom');
      const deleted = await service.deletePrompt('whatsapp', 'chat-123');
      expect(deleted).toBe(true);
    });

    it('should not delete default prompt', async () => {
      const deleted = await service.deletePrompt('whatsapp', '*');
      expect(deleted).toBe(false);
    });
  });

  describe('hasCustomPrompt', () => {
    it('should return false when no custom prompt', async () => {
      const hasCustom = await service.hasCustomPrompt('whatsapp', 'chat-123');
      expect(hasCustom).toBe(false);
    });

    it('should return true when custom prompt exists', async () => {
      await mockDb.setSystemPrompt('whatsapp', 'chat-123', 'Custom');
      const hasCustom = await service.hasCustomPrompt('whatsapp', 'chat-123');
      expect(hasCustom).toBe(true);
    });
  });

  describe('getEmbeddedDefault', () => {
    it('should return embedded default for whatsapp', () => {
      const prompt = service.getEmbeddedDefault('whatsapp');
      expect(prompt).toContain('Ori');
      expect(prompt).toContain('Mini-Apps');
    });

    it('should return embedded default for slack with formatting rules', () => {
      const prompt = service.getEmbeddedDefault('slack');
      expect(prompt).toContain('SLACK FORMATTING');
      expect(prompt).toContain('mrkdwn');
    });
  });
});

describe('createPromptService', () => {
  it('should create a new instance', () => {
    const mockDb = createMockDb();
    const service = createPromptService(mockDb);
    expect(service).toBeInstanceOf(PromptService);
  });
});
