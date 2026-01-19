import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/types.js';
import {
  configGetPrompt,
  configListPrompts,
  configSetPrompt,
} from '../../src/tools/config/prompts.js';
import {
  getPendingActionsStore,
  resetPendingActionsStore,
} from '../../src/tools/config/pending-store.js';

const context = { config: {}, correlationId: 'test' } as ToolContext;

// Mock database functions for testing
const mockListSystemPrompts = vi.fn();

vi.mock('@orient/database-services', () => ({
  createMessageDatabase: () => ({
    getDefaultPrompt: vi.fn().mockResolvedValue(null),
    getSystemPrompt: vi.fn().mockResolvedValue(null),
    listSystemPrompts: mockListSystemPrompts,
  }),
  EMBEDDED_DEFAULT_PROMPTS: {
    whatsapp: 'Default WhatsApp prompt',
    slack: 'Default Slack prompt',
  },
}));

describe('config prompts tools', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    mockListSystemPrompts.mockResolvedValue([
      {
        chatId: '123@g.us',
        platform: 'whatsapp',
        promptText: 'custom prompt',
        updatedAt: new Date(),
      },
      {
        chatId: '*',
        platform: 'slack',
        promptText: 'default prompt',
        updatedAt: new Date(),
      },
    ]);
  });

  it('creates pending action for setting prompts', async () => {
    const result = await configSetPrompt.execute(
      {
        target_type: 'chat',
        target_id: '123@g.us',
        prompt_text: 'New prompt',
      },
      context
    );

    expect(result.status).toBe('pending');
    const store = getPendingActionsStore();
    const action = store.getAction(result.action_id);
    expect(action?.type).toBe('prompt');
  });

  it('gets platform prompt', async () => {
    const result = await configGetPrompt.execute(
      { target_type: 'platform', target_id: 'whatsapp' },
      context
    );

    // Since getDefaultPrompt returns null, it falls back to embedded default
    expect(result.prompt).toBeDefined();
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.source).toBe('embedded_default');
  });

  it('lists prompts', async () => {
    const result = await configListPrompts.execute({}, context);

    expect(result.count).toBe(2);
    expect(result.prompts[0]?.platform).toBe('whatsapp');
  });
});
