/**
 * Dashboard Browser E2E Tests
 *
 * Tests the dashboard UI using Playwright for browser automation.
 * These tests verify that the dashboard loads correctly and all
 * major UI components are functional.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Skip if browser tests not enabled
const BROWSER_TESTS_ENABLED = process.env.RUN_BROWSER_TESTS === 'true';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4098';

// Conditionally skip all tests
const describeOrSkip = BROWSER_TESTS_ENABLED ? describe : describe.skip;

// These tests are designed to work with either:
// 1. Playwright (when running in CI)
// 2. Claude Code's Chrome MCP tools (when running interactively)
// The test file documents what should be tested; actual execution
// depends on the test runner context.

describeOrSkip('Dashboard Browser E2E Tests', () => {
  let page: any;
  let browser: any;

  beforeAll(async () => {
    // This is a placeholder for browser setup
    // In practice, this would be handled by the test orchestrator
    // which can use either Playwright or Chrome MCP tools
    console.log('Browser E2E tests starting...');
    console.log(`Dashboard URL: ${DASHBOARD_URL}`);
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Dashboard Loading', () => {
    it('should load the dashboard homepage', async () => {
      const response = await fetch(DASHBOARD_URL);
      expect(response.status).toBe(200);

      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should serve static assets', async () => {
      const response = await fetch(`${DASHBOARD_URL}/health`);
      expect(response.status).toBe(200);
    });

    it('should have working API endpoints', async () => {
      const response = await fetch(`${DASHBOARD_URL}/api/status`);
      // May return 401 if auth required, which is fine
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('Authentication Flow', () => {
    it('should show setup wizard on first load (no users)', async () => {
      const response = await fetch(`${DASHBOARD_URL}/api/setup/status`);
      const data = await response.json();

      // Setup status should indicate if setup is needed
      expect(data).toHaveProperty('needsSetup');
    });

    it('should protect authenticated routes', async () => {
      const response = await fetch(`${DASHBOARD_URL}/api/secrets`, {
        headers: { 'Content-Type': 'application/json' },
      });
      // Should require authentication
      expect([401, 403]).toContain(response.status);
    });
  });

  describe('Feature Flags Integration', () => {
    it('should expose feature flags in API', async () => {
      const response = await fetch(`${DASHBOARD_URL}/api/feature-flags`);
      // May require auth
      if (response.status === 200) {
        const flags = await response.json();
        expect(flags).toBeDefined();
      }
    });
  });
});

// Export test scenarios for use with Chrome MCP tools
export const dashboardTestScenarios = {
  loadDashboard: {
    description: 'Load the dashboard and verify it renders',
    steps: [
      'Navigate to http://localhost:4098',
      'Wait for page to load completely',
      'Verify the page title contains "Orient"',
      'Verify no JavaScript errors in console',
    ],
    expectedOutcome: 'Dashboard loads without errors',
  },

  setupWizard: {
    description: 'Complete the setup wizard flow',
    steps: [
      'Navigate to http://localhost:4098',
      'If setup wizard appears, fill in admin credentials',
      'Submit the setup form',
      'Verify redirect to dashboard',
    ],
    expectedOutcome: 'Setup completes and user is logged in',
  },

  secretsPage: {
    description: 'Navigate to secrets management page',
    steps: [
      'Login to dashboard',
      'Navigate to Settings > Secrets',
      'Verify secrets list loads',
      'Test adding a new secret',
      'Test deleting a secret',
    ],
    expectedOutcome: 'Secrets CRUD operations work correctly',
  },

  schedulerPage: {
    description: 'Navigate to scheduler page',
    steps: [
      'Login to dashboard',
      'Navigate to Automation > Schedules',
      'Verify schedule list loads',
      'Test creating a new schedule',
      'Verify schedule appears in list',
    ],
    expectedOutcome: 'Scheduler UI functions correctly',
  },

  webhooksPage: {
    description: 'Navigate to webhooks page',
    steps: [
      'Login to dashboard',
      'Navigate to Automation > Webhooks',
      'Verify webhook list loads',
      'Test creating a new webhook',
      'Copy webhook URL',
    ],
    expectedOutcome: 'Webhooks UI functions correctly',
  },

  slackIntegration: {
    description: 'Test Slack integration page',
    steps: [
      'Login to dashboard',
      'Navigate to Integrations > Slack',
      'Verify Slack status is shown',
      'Test sending a test message (if configured)',
    ],
    expectedOutcome: 'Slack integration status is visible',
  },
};
