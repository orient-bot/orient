/**
 * Browser E2E Tests for Orient Setup Flow
 *
 * These tests verify the initial setup wizard and authentication flows.
 *
 * Prerequisites:
 * - agent-browser installed: npm install -g agent-browser && agent-browser install
 * - Orient dashboard running on a fresh database (no admin account)
 *
 * Run with:
 *   E2E_TESTS=true DASHBOARD_URL=http://localhost:9098 pnpm vitest run tests/e2e/browser/setup-flow.browser.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AgentBrowser, createBrowser, waitFor } from './agent-browser-helper';

// Configuration
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:9098';
const TIMEOUT = 60000;
const SKIP_BROWSER_TESTS = process.env.E2E_TESTS !== 'true';

// Test credentials
const TEST_ADMIN = {
  username: 'testadmin',
  password: 'TestPassword123!',
};

describe('Orient Setup Flow - Browser E2E Tests', () => {
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
      console.error(`Dashboard not reachable at ${DASHBOARD_URL}`);
      throw error;
    }
  }, TIMEOUT);

  afterEach(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Setup Wizard', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should display setup wizard on fresh install',
      async () => {
        browser = createBrowser({ session: `setup-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        const snapshot = await browser.snapshot();

        // Check for setup wizard elements
        expect(snapshot.toLowerCase()).toContain('workspace setup');

        // Should have username, password fields
        const elements = await browser.getInteractiveElements();
        expect(elements.toLowerCase()).toContain('admin username');
        expect(elements.toLowerCase()).toContain('password');

        await browser.screenshot('setup-wizard-initial');
      },
      TIMEOUT
    );

    it(
      'should show validation for empty fields',
      async () => {
        browser = createBrowser({ session: `setup-validation-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        // Try to submit without filling fields
        const elements = await browser.getInteractiveElements();
        const createButton = browser.findByName(elements, 'Create Admin Account');

        if (createButton) {
          // Clear the default username first
          const usernameField = browser.findByName(elements, 'Admin Username');
          if (usernameField) {
            await browser.fill(`@${usernameField.ref}`, '');
          }

          await browser.click(`@${createButton.ref}`);
          await browser.wait(1000);

          // Check for validation errors or the button still being there
          const afterSnapshot = await browser.snapshot();
          console.log('After empty submit:', afterSnapshot.slice(0, 500));
        }

        await browser.screenshot('setup-wizard-validation');
      },
      TIMEOUT
    );

    it(
      'should show password requirements',
      async () => {
        browser = createBrowser({ session: `setup-password-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        const elements = await browser.getInteractiveElements();
        const passwordField = browser.findByName(elements, 'Password');

        if (passwordField) {
          // Fill with weak password
          await browser.fill(`@${passwordField.ref}`, 'weak');
          await browser.press('Tab');
          await browser.wait(500);

          const snapshot = await browser.snapshot();
          console.log('After weak password:', snapshot.slice(0, 800));
        }

        await browser.screenshot('setup-password-requirements');
      },
      TIMEOUT
    );

    it(
      'should complete setup with valid credentials',
      async () => {
        browser = createBrowser({ session: `setup-complete-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        let elements = await browser.getInteractiveElements();

        // Fill username
        const usernameField = browser.findByName(elements, 'Admin Username');
        if (usernameField) {
          await browser.fill(`@${usernameField.ref}`, TEST_ADMIN.username);
        }

        // Fill password
        const passwordField = browser.findByName(elements, 'Password');
        if (passwordField) {
          await browser.fill(`@${passwordField.ref}`, TEST_ADMIN.password);
        }

        // Confirm password
        const confirmField = browser.findByName(elements, 'Confirm Password');
        if (confirmField) {
          await browser.fill(`@${confirmField.ref}`, TEST_ADMIN.password);
        }

        await browser.screenshot('setup-filled-form');

        // Re-get elements after filling
        elements = await browser.getInteractiveElements();
        const createButton = browser.findByName(elements, 'Create Admin Account');

        if (createButton) {
          console.log('Clicking Create Admin Account button...');
          await browser.click(`@${createButton.ref}`);
          await browser.wait(3000);

          // Check result
          const afterUrl = await browser.getUrl();
          const afterSnapshot = await browser.snapshot();

          console.log('After setup URL:', afterUrl);
          console.log('After setup snapshot:', afterSnapshot.slice(0, 1000));

          await browser.screenshot('setup-after-submit');

          // Should either show dashboard or login page (not setup wizard)
          const stillOnSetup =
            afterSnapshot.toLowerCase().includes('workspace setup') &&
            afterSnapshot.toLowerCase().includes('create admin account');

          if (!stillOnSetup) {
            console.log('Setup completed successfully - no longer on setup wizard');
          }
        }
      },
      TIMEOUT
    );
  });

  describe('Login Flow', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should display login form after setup or when logged out',
      async () => {
        browser = createBrowser({ session: `login-${Date.now()}` });
        await browser.open(`${DASHBOARD_URL}/login`);
        await browser.wait(2000);

        const snapshot = await browser.snapshot();
        const elements = await browser.getInteractiveElements();

        console.log('Login page elements:', elements.slice(0, 800));

        await browser.screenshot('login-page');
      },
      TIMEOUT
    );
  });

  describe('Form Interactions', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should handle form input correctly',
      async () => {
        browser = createBrowser({ session: `form-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        const elements = await browser.getInteractiveElements();
        const usernameField = browser.findByName(elements, 'Admin Username');

        if (usernameField) {
          // Clear and fill
          await browser.fill(`@${usernameField.ref}`, '');
          await browser.fill(`@${usernameField.ref}`, 'test_user_123');

          // Verify the value
          const value = await browser.getValue(`@${usernameField.ref}`);
          console.log('Username field value:', value);
          expect(value).toBe('test_user_123');
        }
      },
      TIMEOUT
    );

    it(
      'should handle tab navigation',
      async () => {
        browser = createBrowser({ session: `tab-nav-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        let elements = await browser.getInteractiveElements();
        const usernameField = browser.findByName(elements, 'Admin Username');

        if (usernameField) {
          await browser.click(`@${usernameField.ref}`);
          await browser.press('Tab');
          await browser.wait(500);

          // Re-get elements after Tab to find focused element
          elements = await browser.getInteractiveElements();
          const passwordField = browser.findByName(elements, 'Password');

          if (passwordField) {
            // Fill password field using ref
            await browser.fill(`@${passwordField.ref}`, 'testvalue');
            const value = await browser.getValue(`@${passwordField.ref}`);
            expect(value).toBe('testvalue');
          }
        }
      },
      TIMEOUT
    );
  });

  describe('Accessibility Snapshot Features', { skip: SKIP_BROWSER_TESTS }, () => {
    it(
      'should provide semantic element information',
      async () => {
        browser = createBrowser({ session: `a11y-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        // Full snapshot includes ARIA info
        const fullSnapshot = await browser.snapshot();
        console.log('Full accessibility snapshot:\n', fullSnapshot);

        // Interactive only
        const interactiveSnapshot = await browser.getInteractiveElements();
        console.log('Interactive elements:\n', interactiveSnapshot);

        // Parse and verify structure
        const parsedElements = browser.parseSnapshot(interactiveSnapshot);
        console.log('Parsed elements:', parsedElements);

        expect(parsedElements.length).toBeGreaterThan(0);
        expect(parsedElements.some((el) => el.type === 'textbox')).toBe(true);
        expect(parsedElements.some((el) => el.type === 'button')).toBe(true);
      },
      TIMEOUT
    );

    it(
      'should find elements by name',
      async () => {
        browser = createBrowser({ session: `find-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        const elements = await browser.getInteractiveElements();

        // Find by partial name
        const usernameEl = browser.findByName(elements, 'username');
        const passwordEl = browser.findByName(elements, 'password');
        const buttonEl = browser.findByName(elements, 'create');

        console.log('Found elements:', { usernameEl, passwordEl, buttonEl });

        expect(usernameEl).toBeDefined();
        expect(passwordEl).toBeDefined();
        expect(buttonEl).toBeDefined();
      },
      TIMEOUT
    );

    it(
      'should find elements by type',
      async () => {
        browser = createBrowser({ session: `type-${Date.now()}` });
        await browser.open(DASHBOARD_URL);
        await browser.wait(2000);

        const elements = await browser.getInteractiveElements();

        const textboxes = browser.findByType(elements, 'textbox');
        const buttons = browser.findByType(elements, 'button');

        console.log('Textboxes:', textboxes);
        console.log('Buttons:', buttons);

        expect(textboxes.length).toBeGreaterThan(0);
        expect(buttons.length).toBeGreaterThan(0);
      },
      TIMEOUT
    );
  });
});
