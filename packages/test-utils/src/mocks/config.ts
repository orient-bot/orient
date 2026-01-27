/**
 * Mock Config for testing
 *
 * Provides a minimal test configuration.
 */

import type { AppConfig } from '@orientbot/core';

/**
 * Create a minimal mock config for testing
 */
export function createMockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    app: {
      name: 'test-bot',
      environment: 'test',
      logLevel: 'warn',
      adminUsers: ['test-admin'],
      timezone: 'UTC',
    },
    whatsapp: {
      personal: {
        enabled: false,
        adminPhone: '1234567890',
        sessionPath: '/tmp/test-session',
        autoReconnect: false,
        messageRateLimit: 10,
        allowedGroupIds: [],
      },
    },
    integrations: {
      slack: {
        bot: {
          token: 'xoxb-test',
          signingSecret: 'test-secret',
          appToken: 'xapp-test',
        },
        standupChannel: '#test-standup',
        defaultMode: 'bot',
      },
      jira: {
        host: 'https://test.atlassian.net',
        email: 'test@test.com',
        apiToken: 'test-token',
        project: 'TEST',
        component: 'Test Component',
        statusMapping: {
          todo: 'To Do',
          inProgress: 'In Progress',
          done: 'Done',
        },
      },
    },
    ai: {
      anthropic: {
        apiKey: 'test-anthropic-key',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 1024,
      },
      openCode: {
        host: 'localhost',
        port: 3579,
        projectRoot: '/tmp/test',
        configPath: '/tmp/test/.opencode.json',
      },
    },
    server: {
      host: 'localhost',
      port: 4000,
      dashboardPort: 4099,
    },
    database: {
      type: 'sqlite',
      migrationsPath: './migrations',
    },
    features: {
      standup: { enabled: false },
      polling: { enabled: false },
      voting: { enabled: false },
      scheduling: { enabled: false },
    },
    ...overrides,
  } as AppConfig;
}
