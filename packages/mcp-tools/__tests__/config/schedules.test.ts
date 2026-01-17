import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/types.js';
import {
  configCreateSchedule,
  configDeleteSchedule,
  configListSchedules,
  configUpdateSchedule,
} from '../../src/tools/config/schedules.js';
import { getPendingActionsStore, resetPendingActionsStore } from '../../src/tools/config/pending-store.js';

const context = { config: {}, correlationId: 'test' } as ToolContext;

let getJobSpy: ReturnType<typeof vi.fn>;
let getAllJobsSpy: ReturnType<typeof vi.fn>;

vi.mock('@orient/database-services', () => ({
  createSchedulerDatabase: () => ({
    getJob: getJobSpy,
    getAllJobs: getAllJobsSpy,
  }),
}));

describe('config schedules tools', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    getJobSpy = vi.fn().mockResolvedValue({
      id: 7,
      name: 'Weekly Update',
      cronExpression: '0 9 * * 1',
      provider: 'slack',
      target: 'channel-1',
      messageTemplate: 'Weekly update',
      enabled: true,
      lastRunAt: null,
      nextRunAt: new Date(),
    });
    getAllJobsSpy = vi.fn().mockResolvedValue([
      {
        id: 7,
        name: 'Weekly Update',
        cronExpression: '0 9 * * 1',
        provider: 'slack',
        target: 'channel-1',
        messageTemplate: 'Weekly update',
        enabled: true,
        nextRunAt: new Date(),
      },
      {
        id: 8,
        name: 'Disabled',
        cronExpression: '0 9 * * 1',
        provider: 'whatsapp',
        target: 'chat-1',
        messageTemplate: 'Disabled',
        enabled: false,
        nextRunAt: new Date(),
      },
    ]);
  });

  it('creates pending action for new schedules', async () => {
    const result = await configCreateSchedule.execute(
      {
        name: 'Daily',
        cron_expression: '0 9 * * *',
        target_type: 'slack',
        target_id: 'channel-2',
        message: 'Hello',
      },
      context
    );

    expect(result.status).toBe('pending');
    const store = getPendingActionsStore();
    const action = store.getAction(result.action_id);
    expect(action?.type).toBe('schedule');
  });

  it('updates schedules when changes are provided', async () => {
    const result = await configUpdateSchedule.execute(
      { schedule_id: 7, name: 'Updated', enabled: false },
      context
    );

    expect(result.status).toBe('pending');
  });

  it('deletes schedules with confirmation', async () => {
    const result = await configDeleteSchedule.execute({ schedule_id: 7 }, context);

    expect(result.status).toBe('pending');
  });

  it('lists schedules with filters', async () => {
    const result = await configListSchedules.execute({ active_only: true }, context);

    expect(result.count).toBe(1);
    expect(result.schedules[0]?.enabled).toBe(true);
  });
});
