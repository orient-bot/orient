import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/types.js';
import {
  configDeleteSecret,
  configListSecrets,
  configSetSecret,
} from '../../src/tools/config/secrets.js';
import {
  getPendingActionsStore,
  resetPendingActionsStore,
} from '../../src/tools/config/pending-store.js';

const context = { config: {}, correlationId: 'test' } as ToolContext;

let listSecretsSpy: ReturnType<typeof vi.fn>;

vi.mock('@orientbot/database-services', () => ({
  createSecretsService: () => ({
    listSecrets: listSecretsSpy,
  }),
}));

describe('config secrets tools', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    listSecretsSpy = vi.fn().mockResolvedValue([
      {
        key: 'EXISTING_KEY',
        category: 'jira',
        description: 'Existing',
        updatedAt: new Date(),
      },
    ]);
  });

  it('creates pending action for new secrets', async () => {
    listSecretsSpy.mockResolvedValue([]);
    const result = await configSetSecret.execute(
      { key: 'NEW_KEY', value: 'secret', category: 'slack' },
      context
    );

    expect(result.status).toBe('pending');
    const store = getPendingActionsStore();
    const action = store.getAction(result.action_id);
    expect(action?.operation).toBe('create');
  });

  it('lists secret metadata', async () => {
    const result = await configListSecrets.execute({}, context);

    expect(result.count).toBe(1);
    expect(result.secrets[0]?.key).toBe('EXISTING_KEY');
  });

  it('creates pending action for delete when secret exists', async () => {
    const result = await configDeleteSecret.execute({ key: 'EXISTING_KEY' }, context);

    expect(result.status).toBe('pending');
  });

  it('returns error when deleting missing secret', async () => {
    listSecretsSpy.mockResolvedValue([]);
    const result = await configDeleteSecret.execute({ key: 'MISSING' }, context);

    expect(result.success).toBe(false);
  });
});
