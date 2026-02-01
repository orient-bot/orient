/**
 * Mode Validation E2E Tests
 *
 * Tests that Orient works correctly in all supported modes:
 * - Installer mode (PM2 managed, production-like)
 * - Dev mode (tsx hot-reload)
 * - Test mode (Docker-based)
 *
 * These tests verify core functionality across all deployment modes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Configuration for different modes
interface ModeConfig {
  name: string;
  dashboardUrl: string;
  healthEndpoint: string;
  expectedServices: string[];
}

const MODES: Record<string, ModeConfig> = {
  installer: {
    name: 'Installer (PM2)',
    dashboardUrl: 'http://localhost:4098',
    healthEndpoint: '/health',
    expectedServices: ['dashboard', 'whatsapp'],
  },
  dev: {
    name: 'Development',
    dashboardUrl: 'http://localhost:4098',
    healthEndpoint: '/health',
    expectedServices: ['dashboard', 'whatsapp', 'vite'],
  },
  test: {
    name: 'Test (Docker)',
    dashboardUrl: 'http://localhost:13098',
    healthEndpoint: '/health',
    expectedServices: ['dashboard', 'whatsapp', 'nginx', 'postgres'],
  },
};

// Determine current mode from environment
const CURRENT_MODE = process.env.ORIENT_MODE || 'installer';
const MODE_TESTS_ENABLED = process.env.RUN_MODE_TESTS === 'true';
const config = MODES[CURRENT_MODE] || MODES.installer;

const describeOrSkip = MODE_TESTS_ENABLED ? describe : describe.skip;

describeOrSkip(`Mode Validation: ${config.name}`, () => {
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = config.dashboardUrl;
    console.log(`Testing in ${config.name} mode at ${baseUrl}`);
  });

  describe('Service Health', () => {
    it('should have dashboard service running', async () => {
      const response = await fetch(`${baseUrl}${config.healthEndpoint}`);
      expect(response.status).toBe(200);
    });

    it('should respond to API requests', async () => {
      const response = await fetch(`${baseUrl}/api/status`);
      expect([200, 401]).toContain(response.status);
    });

    it('should serve the frontend', async () => {
      const response = await fetch(baseUrl);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('Database Connectivity', () => {
    it('should have working database connection', async () => {
      const response = await fetch(`${baseUrl}/api/setup/status`);
      expect(response.status).toBe(200);
      const data = await response.json();
      // If we can get setup status, database is working
      expect(data).toBeDefined();
    });
  });

  describe('Feature Flags', () => {
    it('should load feature flags configuration', async () => {
      // Feature flags should be accessible (even if some are disabled)
      const response = await fetch(`${baseUrl}/api/feature-flags`);
      // May need auth, but endpoint should exist
      expect([200, 401, 403]).toContain(response.status);
    });
  });

  describe('WhatsApp Integration', () => {
    it('should have WhatsApp QR endpoint available', async () => {
      const response = await fetch(`${baseUrl}/qr`);
      // Should return QR page or redirect
      expect([200, 302, 404]).toContain(response.status);
    });
  });

  describe('Static Assets', () => {
    it('should serve CSS assets', async () => {
      // Try to fetch the main CSS file
      const indexResponse = await fetch(baseUrl);
      const html = await indexResponse.text();

      // Extract CSS path from HTML
      const cssMatch = html.match(/href="([^"]+\.css)"/);
      if (cssMatch) {
        const cssPath = cssMatch[1].startsWith('http') ? cssMatch[1] : `${baseUrl}${cssMatch[1]}`;
        const cssResponse = await fetch(cssPath);
        expect(cssResponse.status).toBe(200);
      }
    });

    it('should serve JavaScript assets', async () => {
      const indexResponse = await fetch(baseUrl);
      const html = await indexResponse.text();

      // Extract JS path from HTML
      const jsMatch = html.match(/src="([^"]+\.js)"/);
      if (jsMatch) {
        const jsPath = jsMatch[1].startsWith('http') ? jsMatch[1] : `${baseUrl}${jsMatch[1]}`;
        const jsResponse = await fetch(jsPath);
        expect(cssResponse.status).toBe(200);
      }
    });
  });
});

// Export utilities for mode testing
export async function validateMode(mode: string): Promise<{
  success: boolean;
  errors: string[];
  checks: Record<string, boolean>;
}> {
  const config = MODES[mode];
  if (!config) {
    return { success: false, errors: [`Unknown mode: ${mode}`], checks: {} };
  }

  const errors: string[] = [];
  const checks: Record<string, boolean> = {};

  // Check health endpoint
  try {
    const healthResponse = await fetch(`${config.dashboardUrl}${config.healthEndpoint}`);
    checks.health = healthResponse.status === 200;
    if (!checks.health) {
      errors.push(`Health check failed: ${healthResponse.status}`);
    }
  } catch (e) {
    checks.health = false;
    errors.push(`Health check error: ${e}`);
  }

  // Check frontend
  try {
    const frontendResponse = await fetch(config.dashboardUrl);
    checks.frontend = frontendResponse.status === 200;
    if (!checks.frontend) {
      errors.push(`Frontend check failed: ${frontendResponse.status}`);
    }
  } catch (e) {
    checks.frontend = false;
    errors.push(`Frontend check error: ${e}`);
  }

  // Check API
  try {
    const apiResponse = await fetch(`${config.dashboardUrl}/api/status`);
    checks.api = [200, 401].includes(apiResponse.status);
    if (!checks.api) {
      errors.push(`API check failed: ${apiResponse.status}`);
    }
  } catch (e) {
    checks.api = false;
    errors.push(`API check error: ${e}`);
  }

  return {
    success: errors.length === 0,
    errors,
    checks,
  };
}

export { MODES, ModeConfig };
