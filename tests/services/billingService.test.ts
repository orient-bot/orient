import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BillingService } from '@orient-bot/dashboard';

describe('BillingService', () => {
  it('returns error when Anthropic admin key missing', async () => {
    const service = new BillingService({ secrets: {} });

    const result = await service.getAnthropicBilling(new Date(), new Date());
    expect(result.available).toBe(false);
    expect(result.error).toContain('ANTHROPIC_ADMIN_KEY');
  });

  it('returns error when Anthropic admin key invalid', async () => {
    const service = new BillingService({ secrets: { ANTHROPIC_ADMIN_KEY: 'not-valid' } });

    const result = await service.getAnthropicBilling(new Date(), new Date());
    expect(result.available).toBe(false);
    expect(result.error).toContain('Invalid Anthropic Admin key');
  });

  it('aggregates provider costs in summary', async () => {
    const service = new BillingService({ secrets: {} });
    service.getAnthropicBilling = vi.fn().mockResolvedValue({
      provider: 'anthropic',
      cost: 1,
      available: true,
    });
    service.getGoogleBilling = vi.fn().mockResolvedValue({
      provider: 'google',
      cost: 2,
      available: true,
    });
    service.getOpenAIBilling = vi.fn().mockResolvedValue({
      provider: 'openai',
      cost: 3,
      available: true,
    });
    service.getCloudflareBilling = vi.fn().mockResolvedValue({
      provider: 'cloudflare',
      cost: 4,
      available: true,
    });
    service.getOracleBilling = vi.fn().mockResolvedValue({
      provider: 'oracle',
      cost: 5,
      available: true,
    });

    const summary = await service.getSummary(new Date('2025-01-01'), new Date('2025-01-02'), false);

    expect(summary.totalCost).toBe(15);
    expect(summary.providers.anthropic.cost).toBe(1);
    expect(summary.providers.oracle.cost).toBe(5);
  });
});
