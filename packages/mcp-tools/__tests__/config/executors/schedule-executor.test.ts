import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPendingActionsStore, resetPendingActionsStore } from '../../../src/tools/config/pending-store.js';
import { registerScheduleExecutor } from '../../../src/tools/config/executors/schedule-executor.js';

let createJobSpy: ReturnType<typeof vi.fn>;
let updateJobSpy: ReturnType<typeof vi.fn>;
let deleteJobSpy: ReturnType<typeof vi.fn>;

vi.mock('@orient/database-services', () => ({
  createSchedulerDatabase: () => ({
    createJob: createJobSpy,
    updateJob: updateJobSpy,
    deleteJob: deleteJobSpy,
  }),
}));

describe('schedule-executor', () => {
  beforeEach(() => {
    resetPendingActionsStore();
    createJobSpy = vi.fn().mockResolvedValue({
      id: 42,
      name: 'Daily Reminder',
      nextRunAt: '2025-01-01T01:00:00Z',
    });
    updateJobSpy = vi.fn();
    deleteJobSpy = vi.fn();
  });

  it('creates schedules', async () => {
    const store = getPendingActionsStore();
    registerScheduleExecutor();

    const action = store.createPendingAction('schedule', 'create', 'new', {
      name: 'Daily Reminder',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      provider: 'slack',
      target: 'channel-1',
      messageTemplate: 'Hello',
      enabled: true,
    });

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    expect(createJobSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Daily Reminder',
        cronExpression: '0 9 * * *',
        provider: 'slack',
        target: 'channel-1',
        messageTemplate: 'Hello',
        enabled: true,
        timezone: 'UTC',
      })
    );
  });

  it('updates schedules', async () => {
    const store = getPendingActionsStore();
    registerScheduleExecutor();

    const action = store.createPendingAction('schedule', 'update', '12', {
      name: 'Updated',
      cronExpression: '0 10 * * *',
      enabled: false,
    });

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    expect(updateJobSpy).toHaveBeenCalledWith(12, {
      name: 'Updated',
      cronExpression: '0 10 * * *',
      enabled: false,
    });
  });

  it('deletes schedules', async () => {
    const store = getPendingActionsStore();
    registerScheduleExecutor();

    const action = store.createPendingAction('schedule', 'delete', '99', {});

    const result = await store.confirmAction(action.actionId);

    expect(result.success).toBe(true);
    expect(deleteJobSpy).toHaveBeenCalledWith(99);
  });
});
