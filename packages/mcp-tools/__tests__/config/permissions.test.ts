import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/types.js';
import {
  configGetPermission,
  configListPermissions,
  configSetPermission,
} from '../../src/tools/config/permissions.js';
import {
  getPendingActionsStore,
  resetPendingActionsStore,
} from '../../src/tools/config/pending-store.js';

const context = { config: {}, correlationId: 'test' } as ToolContext;

let getChatPermissionSpy: ReturnType<typeof vi.fn>;
let getAllChatPermissionsSpy: ReturnType<typeof vi.fn>;

vi.mock('@orientbot/database-services', () => ({
  createMessageDatabase: () => ({
    getChatPermission: getChatPermissionSpy,
    getAllChatPermissions: getAllChatPermissionsSpy,
  }),
}));

describe('config permissions tools', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    getChatPermissionSpy = vi.fn().mockResolvedValue({
      chatId: '123@g.us',
      permission: 'read_only',
      chatType: 'group',
      displayName: 'Team',
      notes: 'default',
      updatedAt: new Date(),
    });
    getAllChatPermissionsSpy = vi.fn().mockResolvedValue([
      {
        chatId: '123@g.us',
        permission: 'read_write',
        chatType: 'group',
        displayName: 'Team',
        notes: null,
        updatedAt: new Date(),
      },
      {
        chatId: '456@s.whatsapp.net',
        permission: 'read_only',
        chatType: 'individual',
        displayName: 'User',
        notes: null,
        updatedAt: new Date(),
      },
    ]);
  });

  it('creates pending action for setting permission', async () => {
    const result = await configSetPermission.execute(
      { chat_id: '123@g.us', permission: 'read_write' },
      context
    );

    expect(result.status).toBe('pending');
    const store = getPendingActionsStore();
    const action = store.getAction(result.action_id);
    expect(action?.changes).toEqual(
      expect.objectContaining({
        permission: 'read_write',
        chatType: 'group',
      })
    );
  });

  it('gets permission for a chat', async () => {
    const result = await configGetPermission.execute({ chat_id: '123@g.us' }, context);

    expect(result.permission).toBe('read_only');
    expect(result.source).toBe('database');
  });

  it('lists permissions with optional filter', async () => {
    const result = await configListPermissions.execute({ permission_filter: 'read_only' }, context);

    expect(result.count).toBe(1);
    expect(result.permissions[0]?.permission).toBe('read_only');
  });
});
