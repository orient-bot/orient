import { describe, expect, it, vi } from 'vitest';
import type { SlackDatabase } from '@orient/database-services';
import { SlackBotService } from '@orient/bot-slack';

const { isServerAvailableSpy } = vi.hoisted(() => ({
  isServerAvailableSpy: vi.fn().mockResolvedValue(true),
}));

vi.mock('@slack/bolt', () => {
  class MockApp {
    client = {
      auth: {
        test: vi.fn().mockResolvedValue({ user_id: 'U123' }),
      },
    };

    start = vi.fn().mockResolvedValue(undefined);
    event = vi.fn();
    message = vi.fn();
    command = vi.fn();
  }

  const mockModule = {
    App: MockApp,
    LogLevel: { INFO: 2 },
  };

  return {
    ...mockModule,
    default: mockModule,
  };
});

describe('SlackBotService', () => {
  const opencodeUrl = process.env.OPENCODE_URL || 'http://localhost:4099';
  const createService = () => {
    const service = new SlackBotService(
      {
        slack: { botToken: 'x', signingSecret: 'y', appToken: 'z' },
        opencode: { serverUrl: opencodeUrl },
      },
      {} as unknown as SlackDatabase
    );

    (
      service as unknown as {
        opencodeHandler: {
          isServerAvailable: typeof isServerAvailableSpy;
          setPromptService: () => void;
        };
      }
    ).opencodeHandler = {
      isServerAvailable: isServerAvailableSpy,
      setPromptService: vi.fn(),
    };

    return service;
  };

  // TODO: Fix test mock - internal createOpenCodeSlackHandler mock path changed during migration
  it.skip('throws when OpenCode server is unavailable', async () => {
    isServerAvailableSpy.mockResolvedValue(false);
    const service = createService();

    await expect(service.start()).rejects.toThrow('OpenCode server is not available');
  });

  it('starts successfully when server is available', async () => {
    isServerAvailableSpy.mockResolvedValue(true);
    const service = createService();

    await expect(service.start()).resolves.not.toThrow();
  });
});
