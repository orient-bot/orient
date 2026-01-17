import { describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { WebhookService } from '@orient/dashboard';

describe('WebhookService', () => {
  it('returns not_found when webhook missing', async () => {
    const db = { getWebhookByName: vi.fn().mockResolvedValue(null) } as any;
    const service = new WebhookService(db);

    const result = await service.processWebhook({
      webhookName: 'missing',
      headers: {},
      body: {},
      rawBody: '',
    });

    expect(result.status).toBe('not_found');
  });

  it('rejects invalid signatures', async () => {
    const webhook = {
      id: 1,
      name: 'custom',
      token: 'secret',
      enabled: true,
      sourceType: 'custom',
      signatureHeader: 'x-signature',
      provider: 'slack',
      target: 'channel',
      eventFilter: [],
    };

    const db = {
      getWebhookByName: vi.fn().mockResolvedValue(webhook),
      recordEvent: vi.fn().mockResolvedValue({ id: 99 }),
      updateEvent: vi.fn(),
    } as any;

    const service = new WebhookService(db);

    const result = await service.processWebhook({
      webhookName: 'custom',
      headers: { 'x-signature': 'sha256=bad' },
      body: {},
      rawBody: '{"test":true}',
    });

    expect(result.status).toBe('invalid_signature');
    expect(db.updateEvent).toHaveBeenCalledWith(99, 'failed', expect.any(Object));
  });

  it('filters events not in filter list', async () => {
    const webhook = {
      id: 2,
      name: 'github',
      token: 'secret',
      enabled: true,
      sourceType: 'github',
      signatureHeader: undefined,
      provider: 'slack',
      target: 'channel',
      eventFilter: ['issues'],
    };

    const db = {
      getWebhookByName: vi.fn().mockResolvedValue(webhook),
      recordEvent: vi.fn().mockResolvedValue({ id: 101 }),
      updateEvent: vi.fn(),
    } as any;

    const service = new WebhookService(db);

    const result = await service.processWebhook({
      webhookName: 'github',
      headers: { 'x-github-event': 'pull_request' },
      body: {},
      rawBody: '',
    });

    expect(result.status).toBe('filtered');
    expect(db.updateEvent).toHaveBeenCalledWith(101, 'filtered', expect.any(Object));
  });

  it('processes webhook and sends message', async () => {
    const webhook = {
      id: 3,
      name: 'custom',
      token: 'secret',
      enabled: true,
      sourceType: 'custom',
      signatureHeader: 'x-signature',
      provider: 'slack',
      target: 'channel',
      eventFilter: [],
      messageTemplate: 'Hello {{webhook_name}}',
    };

    const db = {
      getWebhookByName: vi.fn().mockResolvedValue(webhook),
      recordEvent: vi.fn().mockResolvedValue({ id: 202 }),
      updateEvent: vi.fn(),
      recordTrigger: vi.fn(),
    } as any;

    const service = new WebhookService(db);
    const sendSlack = vi.fn();
    service.setMessageSender({ sendSlack, sendWhatsApp: vi.fn() });

    const rawBody = '{"ping":true}';
    const signature =
      'sha256=' + crypto.createHmac('sha256', 'secret').update(rawBody).digest('hex');

    const result = await service.processWebhook({
      webhookName: 'custom',
      headers: { 'x-signature': signature },
      body: { ping: true },
      rawBody,
    });

    expect(result.status).toBe('processed');
    expect(sendSlack).toHaveBeenCalledWith('channel', 'Hello custom');
    expect(db.recordTrigger).toHaveBeenCalledWith(3);
  });
});
