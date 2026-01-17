import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPendingActionsStore, resetPendingActionsStore } from '../../../src/tools/config/pending-store.js';
import { registerSecretExecutor } from '../../../src/tools/config/executors/secret-executor.js';

let setSecretSpy: ReturnType<typeof vi.fn>;
let deleteSecretSpy: ReturnType<typeof vi.fn>;

vi.mock('@orient/database-services', () => ({
  createSecretsService: () => ({
    setSecret: setSecretSpy,
    deleteSecret: deleteSecretSpy,
  }),
}));

describe('secret-executor', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    setSecretSpy = vi.fn();
    deleteSecretSpy = vi.fn();
  });

  it('creates or updates secrets', async () => {
    const store = getPendingActionsStore();
    registerSecretExecutor();

    const action = store.createPendingAction('secret', 'create', 'API_KEY', {
      value: 'abc123',
      category: 'integrations',
      description: 'API key',
    });

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    expect(setSecretSpy).toHaveBeenCalledWith('API_KEY', 'abc123', {
      category: 'integrations',
      description: 'API key',
      changedBy: 'onboarder-agent',
    });
  });

  it('deletes secrets', async () => {
    const store = getPendingActionsStore();
    registerSecretExecutor();

    const action = store.createPendingAction('secret', 'delete', 'API_KEY', {});

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    expect(deleteSecretSpy).toHaveBeenCalledWith('API_KEY');
  });
});
