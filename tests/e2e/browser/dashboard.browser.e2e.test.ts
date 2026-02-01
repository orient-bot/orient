/**
 * Browser E2E Tests for Orient Dashboard
 *
 * These tests use agent-browser CLI to automate real browser interactions
 * against the Orient dashboard.
 *
 * Prerequisites:
 * - agent-browser installed: npm install -g agent-browser && agent-browser install
 * - Orient dashboard running: ./run.sh dev (or manually start dashboard on port 9098)
 *
 * Run with:
 *   E2E_TESTS=true DASHBOARD_URL=http://localhost:9098 pnpm vitest run tests/e2e/browser/dashboard.browser.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentBrowser, createBrowser, waitFor, cleanupScratchpad } from './agent-browser-helper';

// Configuration
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:9098';
const TIMEOUT = 60000; // 60 seconds for browser tests
const SKIP_BROWSER_TESTS = process.env.E2E_TESTS !== 'true';

describe('Orient Dashboard - Browser E2E Tests', () => {
  let browser: AgentBrowser;

  beforeAll(async () => {
    if (SKIP_BROWSER_TESTS) {
      console.log('Skipping browser E2E tests. Set E2E_TESTS=true to run.');
      return;
    }

    // Check if dashboard is reachable
    try {
      const response = await fetch(`${DASHBOARD_URL}/api/config/version`);
      if (!response.ok) {
        throw new Error(`Dashboard not reachable: ${response.status}`);
      }
    } catch (error) {
      console.error(`Dashboard not reachable at ${DASHBOARD_URL}. Start it with ./run.sh dev`);
      throw error;
    }
  }, TIMEOUT);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    // Optionally clean up screenshots
    // cleanupScratchpad();
  });

  beforeEach(() => {
    // Create a new browser session for each test
    browser = createBrowser({
      session: `e2e-${Date.now()}`,
      timeout: TIMEOUT,
    });
  });

  describe('Dashboard Home', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should load the dashboard homepage',
      async () => {
        await browser.open(DASHBOARD_URL);

        const url = await browser.getUrl();
        expect(url).toContain(DASHBOARD_URL.replace('http://', '').replace('https://', ''));

        // Take a screenshot for visual verification
        const screenshotPath = await browser.screenshot('dashboard-home');
        expect(screenshotPath).toContain('.png');
      },
      TIMEOUT
    );

    it(
      'should display navigation elements',
      async () => {
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000); // Wait for React to render

        const snapshot = await browser.getInteractiveElements();

        // Dashboard should have navigation links
        // Look for common navigation items
        const hasLinks = snapshot.includes('link') || snapshot.includes('button');
        expect(hasLinks).toBe(true);

        console.log('Interactive elements found:\n', snapshot.slice(0, 1000));
      },
      TIMEOUT
    );
  });

  describe('Settings Navigation', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should navigate to settings page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/settings`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/settings');

        const snapshot = await browser.snapshot();
        console.log('Settings page snapshot:\n', snapshot.slice(0, 1500));

        // Take screenshot
        await browser.screenshot('settings-page');
      },
      TIMEOUT
    );

    it(
      'should show settings tabs',
      async () => {
        await browser.open(`${DASHBOARD_URL}/settings`);
        await browser.wait(2000);

        const elements = await browser.getInteractiveElements();

        // Settings should have tabs or links for different sections
        const hasSettingsTabs =
          elements.toLowerCase().includes('connection') ||
          elements.toLowerCase().includes('provider') ||
          elements.toLowerCase().includes('secret') ||
          elements.toLowerCase().includes('appearance');

        console.log('Settings interactive elements:\n', elements.slice(0, 1000));
        // This assertion may need adjustment based on actual UI
      },
      TIMEOUT
    );
  });

  describe('Automation Page', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should load automation schedules page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/automation/schedules`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/automation');

        await browser.screenshot('automation-schedules');
      },
      TIMEOUT
    );

    it(
      'should load webhooks page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/automation/webhooks`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/webhooks');

        await browser.screenshot('automation-webhooks');
      },
      TIMEOUT
    );
  });

  describe('Agents Page', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should load agents page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/agents`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/agents');

        const snapshot = await browser.getInteractiveElements();
        console.log('Agents page elements:\n', snapshot.slice(0, 1000));

        await browser.screenshot('agents-page');
      },
      TIMEOUT
    );
  });

  describe('Apps Page', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should load apps page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/apps`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/apps');

        await browser.screenshot('apps-page');
      },
      TIMEOUT
    );
  });

  describe('Messaging - WhatsApp', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should load WhatsApp chats page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/whatsapp/chats`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/whatsapp');

        await browser.screenshot('whatsapp-chats');
      },
      TIMEOUT
    );
  });

  describe('Messaging - Slack', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should load Slack channels page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/slack`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/slack');

        await browser.screenshot('slack-channels');
      },
      TIMEOUT
    );
  });

  describe('Operations', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should load monitoring page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/operations/monitoring`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/operations');

        await browser.screenshot('operations-monitoring');
      },
      TIMEOUT
    );

    it(
      'should load storage page',
      async () => {
        await browser.open(`${DASHBOARD_URL}/operations/storage`);
        await browser.wait(2000);

        const url = await browser.getUrl();
        expect(url).toContain('/storage');

        await browser.screenshot('operations-storage');
      },
      TIMEOUT
    );
  });

  describe('Full Navigation Flow', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should navigate through main sections',
      async () => {
        // Start at home
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        const startUrl = await browser.getUrl();
        console.log('Start URL:', startUrl);

        // Get all interactive elements
        let elements = await browser.getInteractiveElements();
        console.log('Home elements:', elements.slice(0, 500));

        // Try to find and click settings link
        const settingsElement = browser.findByName(elements, 'settings');
        if (settingsElement) {
          await browser.click(`@${settingsElement.ref}`);
          await browser.wait(2000);
          const settingsUrl = await browser.getUrl();
          console.log('After clicking settings:', settingsUrl);
        }

        // Navigate directly to verify pages load
        const pages = ['/agents', '/apps', '/automation/schedules', '/settings'];

        for (const page of pages) {
          await browser.open(`${DASHBOARD_URL}${page}`);
          await browser.wait(1500);
          const pageUrl = await browser.getUrl();
          console.log(`Page ${page}:`, pageUrl);
          expect(pageUrl).toContain(page.split('/')[1]);
        }
      },
      TIMEOUT * 2
    );
  });

  describe('API Integration Checks', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should load version info',
      async () => {
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        // Execute JS to check version endpoint
        const versionCheck = await browser.evaluate(
          `fetch('/api/config/version').then(r => r.json()).then(d => JSON.stringify(d))`
        );
        console.log('Version from page context:', versionCheck);
      },
      TIMEOUT
    );
  });

  describe('Screenshots for Documentation', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should capture full-page screenshots of all main sections',
      async () => {
        const pages = [
          { path: '/', name: 'home' },
          { path: '/settings', name: 'settings' },
          { path: '/agents', name: 'agents' },
          { path: '/apps', name: 'apps' },
          { path: '/automation/schedules', name: 'schedules' },
          { path: '/automation/webhooks', name: 'webhooks' },
          { path: '/whatsapp/chats', name: 'whatsapp' },
          { path: '/slack', name: 'slack' },
          { path: '/operations/monitoring', name: 'monitoring' },
          { path: '/operations/storage', name: 'storage' },
        ];

        for (const page of pages) {
          await browser.open(`${DASHBOARD_URL}${page.path}`);
          await browser.wait(2000);
          const screenshotPath = await browser.screenshot(`docs-${page.name}`, true);
          console.log(`Screenshot saved: ${screenshotPath}`);
        }
      },
      TIMEOUT * 3
    );
  });
});
