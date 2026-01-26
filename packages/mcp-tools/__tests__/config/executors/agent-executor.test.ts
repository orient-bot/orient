import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPendingActionsStore,
  resetPendingActionsStore,
} from '../../../src/tools/config/pending-store.js';
import { registerAgentExecutor } from '../../../src/tools/config/executors/agent-executor.js';

let updateSpy: ReturnType<typeof vi.fn>;
let setSpy: ReturnType<typeof vi.fn>;
let whereSpy: ReturnType<typeof vi.fn>;

vi.mock('@orient/database', () => ({
  getDatabase: () => ({
    update: updateSpy,
  }),
  agents: { id: 'id' },
  eq: vi.fn(() => 'eq'),
}));

describe('agent-executor', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    whereSpy = vi.fn();
    setSpy = vi.fn(() => ({ where: whereSpy }));
    updateSpy = vi.fn(() => ({ set: setSpy }));
  });

  it('updates agent fields via executor', async () => {
    const store = getPendingActionsStore();
    registerAgentExecutor();

    const action = store.createPendingAction('agent', 'update', 'agent-1', {
      enabled: false,
      basePrompt: 'New prompt',
      modelDefault: 'gpt-4',
      modelFallback: 'gpt-3.5',
    });

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        basePrompt: 'New prompt',
        modelDefault: 'gpt-4',
        modelFallback: 'gpt-3.5',
        updatedAt: expect.any(Date),
      })
    );
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });
});
