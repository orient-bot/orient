import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPendingActionsStore,
  resetPendingActionsStore,
} from '../../../src/tools/config/pending-store.js';
import { registerPromptExecutor } from '../../../src/tools/config/executors/prompt-executor.js';

// Create a mutable reference for the spy that can be updated in beforeEach
const mockSetSystemPrompt = vi.fn();

vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@orient-bot/database-services', () => ({
  createMessageDatabase: () => ({
    setSystemPrompt: mockSetSystemPrompt,
  }),
}));

describe('prompt-executor', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    mockSetSystemPrompt.mockClear();
  });

  it('updates platform default prompts', async () => {
    const store = getPendingActionsStore();
    registerPromptExecutor();

    const action = store.createPendingAction('prompt', 'update', 'whatsapp', {
      targetType: 'platform',
      promptText: 'Default prompt',
    });

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    // Platform default uses chatId = '*'
    expect(mockSetSystemPrompt).toHaveBeenCalledWith('whatsapp', '*', 'Default prompt');
  });

  it('updates chat-specific prompts', async () => {
    const store = getPendingActionsStore();
    registerPromptExecutor();

    const action = store.createPendingAction('prompt', 'update', '12345@s.whatsapp.net', {
      targetType: 'chat',
      promptText: 'Custom prompt',
    });

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    expect(mockSetSystemPrompt).toHaveBeenCalledWith(
      'whatsapp',
      '12345@s.whatsapp.net',
      'Custom prompt'
    );
  });
});
