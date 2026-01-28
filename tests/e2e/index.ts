/**
 * E2E Test Suite Index
 *
 * Exports all test scenarios for use with browser automation tools.
 * These scenarios can be used with:
 * - Claude Code's Chrome MCP tools (interactive testing)
 * - Playwright (automated CI testing)
 * - Manual testing checklists
 */

// Re-export test scenarios from all feature tests
export { dashboardTestScenarios } from './browser/dashboard.e2e.test';
export { secretsTestScenarios } from './features/secrets.e2e.test';
export { schedulerTestScenarios } from './features/scheduler.e2e.test';
export { webhookTestScenarios } from './features/webhooks.e2e.test';
export { slackTestScenarios } from './features/slack-integration.e2e.test';

// Export mode validation utilities
export { validateMode, MODES } from './modes/mode-validation.e2e.test';

// Comprehensive test checklist for manual/interactive testing
export const comprehensiveTestChecklist = {
  // Phase 1: System Setup
  setup: {
    description: 'System setup and initial configuration',
    tests: [
      {
        id: 'setup-1',
        name: 'Fresh install completes successfully',
        steps: [
          'Run ./installer/install-local.sh',
          'Verify no errors in output',
          'Check orient start command works',
          'Verify dashboard opens in browser',
        ],
        expectedResult: 'Orient installed and running',
      },
      {
        id: 'setup-2',
        name: 'Setup wizard completes',
        steps: [
          'Navigate to http://localhost:4098',
          'Complete setup wizard with admin credentials',
          'Verify redirect to main dashboard',
        ],
        expectedResult: 'Admin user created and logged in',
      },
      {
        id: 'setup-3',
        name: 'Database initialized',
        steps: [
          'Check SQLite database exists',
          'Verify tables are created',
          'Check feature flags are loaded',
        ],
        expectedResult: 'Database properly initialized',
      },
    ],
  },

  // Phase 2: Core Features
  coreFeatures: {
    description: 'Test core functionality',
    tests: [
      {
        id: 'core-1',
        name: 'Dashboard navigation',
        steps: [
          'Login to dashboard',
          'Navigate to each main section',
          'Verify no JavaScript errors',
          'Check responsive layout',
        ],
        expectedResult: 'All sections load correctly',
      },
      {
        id: 'core-2',
        name: 'API authentication',
        steps: [
          'Make unauthenticated API request',
          'Verify 401 response',
          'Login and get token',
          'Make authenticated request',
          'Verify 200 response',
        ],
        expectedResult: 'Authentication works correctly',
      },
      {
        id: 'core-3',
        name: 'Feature flags',
        steps: [
          'Check default feature flags',
          'Enable a disabled feature',
          'Verify UI updates',
          'Disable the feature',
          'Verify UI updates again',
        ],
        expectedResult: 'Feature flags control UI correctly',
      },
    ],
  },

  // Phase 3: Secrets Management
  secrets: {
    description: 'Test secrets functionality',
    tests: [
      {
        id: 'secrets-1',
        name: 'Create secret',
        steps: [
          'Navigate to Settings > Secrets',
          'Click Add Secret',
          'Enter name, value, category',
          'Save secret',
          'Verify appears in list with masked value',
        ],
        expectedResult: 'Secret created successfully',
      },
      {
        id: 'secrets-2',
        name: 'Edit secret',
        steps: [
          'Click edit on existing secret',
          'Update value',
          'Save changes',
          'Verify update timestamp changes',
        ],
        expectedResult: 'Secret updated successfully',
      },
      {
        id: 'secrets-3',
        name: 'Delete secret',
        steps: ['Click delete on existing secret', 'Confirm deletion', 'Verify removed from list'],
        expectedResult: 'Secret deleted successfully',
      },
      {
        id: 'secrets-4',
        name: 'API secret access',
        steps: [
          'Create secret via API',
          'Retrieve secret via API',
          'Verify value is returned (or masked based on permissions)',
          'Delete via API',
        ],
        expectedResult: 'API operations work correctly',
      },
    ],
  },

  // Phase 4: Scheduler
  scheduler: {
    description: 'Test scheduler functionality',
    tests: [
      {
        id: 'scheduler-1',
        name: 'Create schedule',
        steps: [
          'Navigate to Automation > Schedules',
          'Click Create Schedule',
          'Enter name and cron expression',
          'Select provider and channel',
          'Enter message template',
          'Save (disabled)',
        ],
        expectedResult: 'Schedule created successfully',
      },
      {
        id: 'scheduler-2',
        name: 'Visual cron builder',
        steps: [
          'Open schedule creation',
          'Use visual cron builder',
          'Select "Every weekday at 9 AM"',
          'Verify cron expression is correct',
          'Check preview shows correct next runs',
        ],
        expectedResult: 'Cron builder works correctly',
      },
      {
        id: 'scheduler-3',
        name: 'Enable/disable schedule',
        steps: [
          'Toggle schedule to enabled',
          'Verify status changes',
          'Toggle back to disabled',
          'Verify status changes',
        ],
        expectedResult: 'Toggle works correctly',
      },
      {
        id: 'scheduler-4',
        name: 'Manual trigger',
        steps: [
          'Click "Run Now" on schedule',
          'Verify execution starts',
          'Check execution history',
          'Verify message was sent (if connected)',
        ],
        expectedResult: 'Manual execution works',
      },
    ],
  },

  // Phase 5: Webhooks
  webhooks: {
    description: 'Test webhook functionality',
    tests: [
      {
        id: 'webhook-1',
        name: 'Create webhook',
        steps: [
          'Navigate to Automation > Webhooks',
          'Click Create Webhook',
          'Enter name and configure',
          'Save and copy URL',
        ],
        expectedResult: 'Webhook created with URL',
      },
      {
        id: 'webhook-2',
        name: 'Test webhook endpoint',
        steps: [
          'Send POST to webhook URL with valid signature',
          'Verify 200 response',
          'Check event appears in history',
        ],
        expectedResult: 'Webhook accepts valid requests',
      },
      {
        id: 'webhook-3',
        name: 'Signature validation',
        steps: [
          'Send POST with invalid signature',
          'Verify 401/403 response',
          'Check event is rejected',
        ],
        expectedResult: 'Invalid signatures rejected',
      },
      {
        id: 'webhook-4',
        name: 'Event filtering',
        steps: [
          'Configure webhook with event filter',
          'Send matching event type',
          'Verify event is processed',
          'Send non-matching event type',
          'Verify event is filtered',
        ],
        expectedResult: 'Event filtering works',
      },
    ],
  },

  // Phase 6: Slack Integration
  slack: {
    description: 'Test Slack integration (requires Slack setup)',
    tests: [
      {
        id: 'slack-1',
        name: 'Connection status',
        steps: [
          'Navigate to Integrations > Slack',
          'Verify connection status is displayed',
          'Check workspace and bot info',
        ],
        expectedResult: 'Status shows connected',
      },
      {
        id: 'slack-2',
        name: 'Send test message',
        steps: [
          'Select a test channel',
          'Enter test message',
          'Click Send',
          'Verify message in Slack',
        ],
        expectedResult: 'Message delivered to Slack',
      },
      {
        id: 'slack-3',
        name: 'Channel list',
        steps: [
          'View available channels',
          'Check bot membership status',
          'Verify public/private indicators',
        ],
        expectedResult: 'Channels listed correctly',
      },
      {
        id: 'slack-4',
        name: 'Scheduled Slack message',
        steps: [
          'Create schedule with Slack provider',
          'Run manually',
          'Verify message in Slack channel',
        ],
        expectedResult: 'Scheduled message delivered',
      },
    ],
  },

  // Phase 7: Multi-Mode Testing
  modes: {
    description: 'Test across different run modes',
    tests: [
      {
        id: 'mode-installer',
        name: 'Test installer mode',
        steps: [
          'Stop any running Orient',
          'Run fresh install',
          'Run orient start',
          'Run full test suite',
          'Verify all tests pass',
        ],
        expectedResult: 'Installer mode works correctly',
      },
      {
        id: 'mode-dev',
        name: 'Test dev mode',
        steps: [
          'Stop Orient',
          'Run ./run.sh dev',
          'Wait for services to start',
          'Run full test suite against dev URLs',
          'Test hot reload by editing a file',
        ],
        expectedResult: 'Dev mode works correctly',
      },
      {
        id: 'mode-test',
        name: 'Test Docker mode',
        steps: [
          'Stop all services',
          'Run ./run.sh test',
          'Wait for containers to start',
          'Run full test suite against test URLs',
          'Check Docker logs for errors',
        ],
        expectedResult: 'Docker mode works correctly',
      },
    ],
  },
};

// Quick validation function for CI
export async function quickValidation(baseUrl: string): Promise<{
  success: boolean;
  checks: { name: string; passed: boolean; error?: string }[];
}> {
  const checks: { name: string; passed: boolean; error?: string }[] = [];

  // Health check
  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    checks.push({ name: 'Health endpoint', passed: healthRes.ok });
  } catch (e) {
    checks.push({ name: 'Health endpoint', passed: false, error: String(e) });
  }

  // Frontend check
  try {
    const frontendRes = await fetch(baseUrl);
    const html = await frontendRes.text();
    checks.push({
      name: 'Frontend loads',
      passed: frontendRes.ok && html.includes('<!DOCTYPE html>'),
    });
  } catch (e) {
    checks.push({ name: 'Frontend loads', passed: false, error: String(e) });
  }

  // API check
  try {
    const apiRes = await fetch(`${baseUrl}/api/setup/status`);
    checks.push({
      name: 'API responds',
      passed: apiRes.ok || apiRes.status === 401,
    });
  } catch (e) {
    checks.push({ name: 'API responds', passed: false, error: String(e) });
  }

  return {
    success: checks.every((c) => c.passed),
    checks,
  };
}
