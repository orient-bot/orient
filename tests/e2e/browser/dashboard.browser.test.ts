/**
 * Browser E2E Tests for Orient Dashboard
 *
 * Tests the dashboard UI using agent-browser for browser automation.
 *
 * Prerequisites:
 * - agent-browser installed globally: npm install -g agent-browser
 * - agent-browser install (for Chromium)
 * - Dashboard running: pnpm dashboard:dev
 *
 * Run with:
 *   BROWSER_E2E=true pnpm test tests/e2e/browser/dashboard.browser.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentBrowser, createBrowser, getDashboardUrl, getApiUrl } from './agent-browser';

// Skip if BROWSER_E2E is not set (browser tests are opt-in)
const runBrowserTests = process.env.BROWSER_E2E === 'true';

describe.skipIf(!runBrowserTests)('Dashboard Browser E2E Tests', () => {
  let browser: AgentBrowser;
  const dashboardUrl = getDashboardUrl();

  beforeAll(async () => {
    // Verify dashboard is running
    try {
      const response = await fetch(`${getApiUrl()}/api/config/version`);
      if (!response.ok) {
        throw new Error('Dashboard API not responding');
      }
    } catch (error) {
      console.error('Dashboard not running. Start with: pnpm dashboard:dev');
      throw error;
    }

    // Create browser instance with unique session
    browser = createBrowser({
      session: `e2e-dashboard-${Date.now()}`,
    });
  }, 30000); // 30s timeout for beforeAll

  afterAll(async () => {
    await browser.close();
  });

  describe('Navigation', () => {
    it('should load the dashboard and redirect to login', async () => {
      await browser.open(dashboardUrl);
      const url = await browser.getUrl();
      // Dashboard should redirect to login or show main page
      expect(url).toContain('localhost');
    }, 15000); // 15s timeout for first navigation

    it('should display the dashboard title', async () => {
      await browser.open(dashboardUrl);
      const title = await browser.getTitle();
      expect(title).toBeTruthy();
    });

    it('should have interactive elements on the page', async () => {
      await browser.open(dashboardUrl);
      const snapshot = await browser.snapshot(true);
      expect(snapshot).toContain('ref=');
    });
  });

  describe('Login Page', () => {
    beforeEach(async () => {
      await browser.open(dashboardUrl);
    });

    it('should display login form elements', async () => {
      const elements = await browser.getElements(true);
      const textboxes = elements.filter((e) => e.type === 'textbox');
      // Should have username and password fields
      expect(textboxes.length).toBeGreaterThanOrEqual(2);
    });

    it('should have a sign in button', async () => {
      const elements = await browser.getElements(true);
      const buttons = elements.filter((e) => e.type === 'button');
      const signInButton = buttons.find((b) => b.text?.toLowerCase().includes('sign'));
      expect(signInButton).toBeDefined();
    });

    it('should have Google OAuth option', async () => {
      const elements = await browser.getElements(true);
      const googleButton = elements.find(
        (e) => e.type === 'button' && e.text?.toLowerCase().includes('google')
      );
      expect(googleButton).toBeDefined();
    });
  });

  describe('Screenshots', () => {
    it('should capture a screenshot of the login page', async () => {
      await browser.open(dashboardUrl);
      const screenshotPath = await browser.screenshot('dashboard-login.png');
      expect(screenshotPath).toContain('dashboard-login.png');
    });
  });

  describe('Login Form Interaction', () => {
    it('should fill in username and password fields', async () => {
      await browser.open(dashboardUrl);

      // Get elements
      const elements = await browser.getElements(true);
      const usernameField = elements.find((e) => e.text === 'Username');
      const passwordField = elements.find((e) => e.text === 'Password');

      expect(usernameField).toBeDefined();
      expect(passwordField).toBeDefined();

      // Fill in the form
      await browser.fill(usernameField!.ref, 'testuser');
      await browser.fill(passwordField!.ref, 'testpassword');

      // Verify values were entered
      const usernameValue = await browser.getValue(usernameField!.ref);
      const passwordValue = await browser.getValue(passwordField!.ref);

      expect(usernameValue).toBe('testuser');
      expect(passwordValue).toBe('testpassword');

      // Take screenshot of filled form
      await browser.screenshot('login-form-filled.png');
    });

    it('should show form after clearing and re-filling', async () => {
      await browser.open(dashboardUrl);
      const elements = await browser.getElements(true);
      const usernameField = elements.find((e) => e.text === 'Username');

      // Fill with different value
      await browser.fill(usernameField!.ref, 'another-user');
      const value = await browser.getValue(usernameField!.ref);
      expect(value).toBe('another-user');
    });
  });
});

describe.skipIf(!runBrowserTests)('Settings Page E2E Tests', () => {
  let browser: AgentBrowser;
  const dashboardUrl = getDashboardUrl();

  beforeAll(async () => {
    browser = createBrowser({
      session: `e2e-settings-${Date.now()}`,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('Settings Navigation', () => {
    it('should navigate to settings page', async () => {
      await browser.open(`${dashboardUrl}/settings`);
      const url = await browser.getUrl();
      expect(url).toContain('settings');
    });

    it('should display settings sections', async () => {
      await browser.open(`${dashboardUrl}/settings`);
      const snapshot = await browser.snapshot(true);
      // Settings page should have tabs or links for different sections
      expect(snapshot.length).toBeGreaterThan(0);
    });

    it('should navigate to providers settings', async () => {
      await browser.open(`${dashboardUrl}/settings/providers`);
      const url = await browser.getUrl();
      expect(url).toContain('providers');
    });

    it('should navigate to appearance settings', async () => {
      await browser.open(`${dashboardUrl}/settings/appearance`);
      const url = await browser.getUrl();
      expect(url).toContain('appearance');
    });
  });
});

describe.skipIf(!runBrowserTests)('WhatsApp Page E2E Tests', () => {
  let browser: AgentBrowser;
  const dashboardUrl = getDashboardUrl();

  beforeAll(async () => {
    browser = createBrowser({
      session: `e2e-whatsapp-${Date.now()}`,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('WhatsApp Navigation', () => {
    it('should navigate to WhatsApp page', async () => {
      await browser.open(`${dashboardUrl}/whatsapp`);
      const url = await browser.getUrl();
      expect(url).toContain('whatsapp');
    });

    it('should display WhatsApp interface elements', async () => {
      await browser.open(`${dashboardUrl}/whatsapp`);
      const snapshot = await browser.snapshot(true);
      expect(snapshot.length).toBeGreaterThan(0);
    });
  });
});

describe.skipIf(!runBrowserTests)('Agents Page E2E Tests', () => {
  let browser: AgentBrowser;
  const dashboardUrl = getDashboardUrl();

  beforeAll(async () => {
    browser = createBrowser({
      session: `e2e-agents-${Date.now()}`,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('Agents Navigation', () => {
    it('should navigate to agents page', async () => {
      await browser.open(`${dashboardUrl}/agents`);
      const url = await browser.getUrl();
      expect(url).toContain('agents');
    });

    it('should display agents interface', async () => {
      await browser.open(`${dashboardUrl}/agents`);
      const snapshot = await browser.snapshot(true);
      expect(snapshot.length).toBeGreaterThan(0);
    });

    it('should capture agents page screenshot', async () => {
      await browser.open(`${dashboardUrl}/agents`);
      const screenshotPath = await browser.screenshot('agents-page.png');
      expect(screenshotPath).toContain('agents-page.png');
    });
  });
});
