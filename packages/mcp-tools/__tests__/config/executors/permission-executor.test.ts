import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPendingActionsStore, resetPendingActionsStore } from '../../../src/tools/config/pending-store.js';
import { registerPermissionExecutor } from '../../../src/tools/config/executors/permission-executor.js';

let setChatPermissionSpy: ReturnType<typeof vi.fn>;

vi.mock('@orient/database-services', () => ({
  createMessageDatabase: () => ({
    setChatPermission: setChatPermissionSpy,
  }),
}));

describe('permission-executor', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    setChatPermissionSpy = vi.fn();
  });

  it('sets chat permissions', async () => {
    const store = getPendingActionsStore();
    registerPermissionExecutor();

    const action = store.createPendingAction('permission', 'update', 'chat-1', {
      permission: 'allow',
      chatType: 'group',
      displayName: 'Team Chat',
      notes: 'Allowed by onboarding',
    });

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    expect(setChatPermissionSpy).toHaveBeenCalledWith(
      'chat-1',
      'group',
      'allow',
      'Team Chat',
      'Allowed by onboarding',
      'onboarder-agent'
    );
  });
});
