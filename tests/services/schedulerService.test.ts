import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SchedulerService } from '@orientbot/dashboard';

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({ stop: vi.fn() })),
    validate: vi.fn(() => true),
  },
  schedule: vi.fn(() => ({ stop: vi.fn() })),
  validate: vi.fn(() => true),
}));

describe('SchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('processes template variables', () => {
    const db = {} as any;
    const service = new SchedulerService(db, { defaultTimezone: 'UTC' });

    const job = {
      id: 1,
      name: 'Daily Summary',
      scheduleType: 'cron',
      provider: 'slack',
      target: 'channel',
      messageTemplate: 'Hello {{job.name}} on {{day}} at {{time}}',
      enabled: true,
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
    } as any;

    const output = (service as any).processTemplate(job.messageTemplate, job);
    const expectedTime = new Date().toTimeString().slice(0, 5);
    expect(output).toContain('Daily Summary');
    expect(output).toContain('Wednesday');
    expect(output).toContain(expectedTime);
  });

  it('throws when message sender not configured', async () => {
    const db = {} as any;
    const service = new SchedulerService(db);

    await expect((service as any).sendMessage('slack', 'channel', 'Hi')).rejects.toThrow(
      'Message sender not configured'
    );
  });

  it('schedules cron jobs on creation', async () => {
    const db = {
      createJob: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Daily',
        scheduleType: 'cron',
        provider: 'slack',
        target: 'channel',
        messageTemplate: 'Hello',
        enabled: true,
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
      }),
    } as any;

    const service = new SchedulerService(db);
    const job = await service.createJob({
      name: 'Daily',
      scheduleType: 'cron',
      provider: 'slack',
      target: 'channel',
      messageTemplate: 'Hello',
      cronExpression: '0 9 * * *',
      enabled: true,
    } as any);

    expect(job).toBeDefined();
    expect(job.cronExpression).toBe('0 9 * * *');
  });
});
