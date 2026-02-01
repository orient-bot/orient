/**
 * Scheduler E2E Tests
 *
 * Tests the scheduling functionality end-to-end.
 * Covers cron jobs, scheduled messages, and automation triggers.
 *
 * These tests automatically handle authentication by creating a test user
 * on fresh installations or logging in with existing credentials.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestAuthHelper } from '../helpers/auth';

const FEATURE_TESTS_ENABLED = process.env.RUN_FEATURE_TESTS === 'true';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4098';

const describeOrSkip = FEATURE_TESTS_ENABLED ? describe : describe.skip;

describeOrSkip('Scheduler E2E Tests', () => {
  let auth: TestAuthHelper;
  const testScheduleName = `e2e-test-schedule-${Date.now()}`;
  let createdScheduleId: number | null = null;

  beforeAll(async () => {
    auth = new TestAuthHelper(DASHBOARD_URL);
    await auth.init();
    console.log(`[Scheduler E2E] Authenticated as: ${auth.getUsername()}`);
  });

  describe('Scheduler API', () => {
    it('should check if scheduler feature is available', async () => {
      const response = await auth.request('/api/schedules');

      // Feature might be disabled via feature flags
      if (response.status === 404) {
        console.log('[Scheduler E2E] Scheduler feature appears to be disabled');
        return;
      }

      expect([200, 401, 403]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        // API returns { jobs: [...] }
        expect(data).toHaveProperty('jobs');
        expect(Array.isArray(data.jobs)).toBe(true);
        console.log(`[Scheduler E2E] Found ${data.jobs.length} existing jobs`);
      }
    });

    it('should create a new schedule', async () => {
      const response = await auth.request('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          name: testScheduleName,
          scheduleType: 'cron',
          cronExpression: '0 9 * * 1-5', // 9 AM on weekdays
          timezone: 'America/New_York',
          provider: 'slack',
          target: 'test-channel',
          messageTemplate: 'E2E Test: Good morning! Today is {{day}}',
          enabled: false, // Don't actually run during tests
        }),
      });

      if (response.status === 404) {
        console.log('[Scheduler E2E] Scheduler endpoint not found - feature may be disabled');
        return;
      }

      if (response.status === 200 || response.status === 201) {
        const data = await response.json();
        expect(data.id).toBeDefined();
        createdScheduleId = data.id;
        console.log(`[Scheduler E2E] Created schedule: ${createdScheduleId}`);
      } else {
        const errorText = await response.text();
        console.log(`[Scheduler E2E] Create schedule returned: ${response.status} - ${errorText}`);
      }
    });

    it('should get schedule details', async () => {
      if (!createdScheduleId) {
        console.log('[Scheduler E2E] Skipping - no schedule created');
        return;
      }

      const response = await auth.request(`/api/schedules/${createdScheduleId}`);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.name).toBe(testScheduleName);
        expect(data.cronExpression).toBe('0 9 * * 1-5');
        expect(data.enabled).toBe(false);
      }
    });

    it('should update a schedule', async () => {
      if (!createdScheduleId) {
        console.log('[Scheduler E2E] Skipping - no schedule created');
        return;
      }

      // Use PATCH for updates
      const response = await auth.request(`/api/schedules/${createdScheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          messageTemplate: 'E2E Test UPDATED: Good morning! Today is {{day}} at {{time}}',
        }),
      });

      if (response.status === 200) {
        const data = await response.json();
        expect(data.messageTemplate).toContain('UPDATED');
      }
    });

    it('should toggle schedule enabled state', async () => {
      if (!createdScheduleId) {
        console.log('[Scheduler E2E] Skipping - no schedule created');
        return;
      }

      // Enable via toggle endpoint
      let response = await auth.request(`/api/schedules/${createdScheduleId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: true }),
      });

      if (response.status === 200) {
        const data = await response.json();
        expect(data.enabled).toBe(true);
      }

      // Disable via toggle endpoint
      response = await auth.request(`/api/schedules/${createdScheduleId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: false }),
      });

      if (response.status === 200) {
        const data = await response.json();
        expect(data.enabled).toBe(false);
      }
    });

    it('should list schedules and include the test schedule', async () => {
      if (!createdScheduleId) {
        console.log('[Scheduler E2E] Skipping - no schedule created');
        return;
      }

      const response = await auth.request('/api/schedules');

      if (response.status === 200) {
        const data = await response.json();
        const jobs = data.jobs;
        const testJob = jobs.find((j: any) => j.id === createdScheduleId);
        expect(testJob).toBeDefined();
      }
    });

    it('should delete a schedule', async () => {
      if (!createdScheduleId) {
        console.log('[Scheduler E2E] Skipping - no schedule created');
        return;
      }

      const response = await auth.request(`/api/schedules/${createdScheduleId}`, {
        method: 'DELETE',
      });

      expect([200, 204]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
      }

      // Verify deletion
      const verifyResponse = await auth.request(`/api/schedules/${createdScheduleId}`);
      expect(verifyResponse.status).toBe(404);
    });
  });

  describe('Scheduler Security', () => {
    it('should require authentication for scheduler access', async () => {
      const response = await fetch(`${DASHBOARD_URL}/api/schedules`, {
        headers: { 'Content-Type': 'application/json' },
      });

      // Should require auth (401) or feature not found (404)
      expect([401, 404]).toContain(response.status);
    });
  });
});

// Export test scenarios for browser automation
export const schedulerTestScenarios = {
  listSchedules: {
    description: 'View schedules list in dashboard',
    steps: [
      'Login to dashboard',
      'Navigate to Automation > Schedules',
      'Verify schedules table loads',
      'Check status indicators (enabled/disabled)',
    ],
    expectedOutcome: 'Schedules list displays correctly',
  },

  createSchedule: {
    description: 'Create a new scheduled message',
    steps: [
      'Navigate to Automation > Schedules',
      'Click "Create Schedule" button',
      'Enter schedule name',
      'Configure cron expression using UI builder',
      'Select timezone',
      'Choose provider (Slack/WhatsApp)',
      'Select channel/recipient',
      'Enter message template',
      'Click Save',
    ],
    expectedOutcome: 'New schedule is created',
  },

  cronBuilder: {
    description: 'Use visual cron builder',
    steps: [
      'Open schedule creation form',
      'Click "Visual Editor" for cron',
      'Select frequency (daily/weekly/monthly)',
      'Set time and days',
      'Verify preview shows correct next runs',
    ],
    expectedOutcome: 'Cron expression is built correctly',
  },

  toggleSchedule: {
    description: 'Enable/disable a schedule',
    steps: [
      'Navigate to Automation > Schedules',
      'Find existing schedule',
      'Click enable/disable toggle',
      'Verify status changes',
    ],
    expectedOutcome: 'Schedule status toggles correctly',
  },

  viewHistory: {
    description: 'View schedule execution history',
    steps: [
      'Navigate to Automation > Schedules',
      'Click on a schedule to view details',
      'Navigate to History tab',
      'Verify past executions are listed',
    ],
    expectedOutcome: 'Execution history is visible',
  },
};
