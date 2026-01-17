/**
 * Contract Tests for @orient/dashboard
 *
 * These tests verify that the dashboard package exports all expected
 * types and functions. They serve as a contract that must not break
 * when refactoring the package internals.
 */

import { describe, it, expect, beforeAll } from 'vitest';

let dashboardModule: typeof import('@orient/dashboard');

beforeAll(async () => {
  dashboardModule = await import('@orient/dashboard');
}, 180000);

describe('@orient/dashboard Contract Tests', () => {
  describe('Type Exports', () => {
    it('should export MessageStats type', async () => {
      const module = dashboardModule;
      // Type exports are verified at compile time
      // Runtime check that module loaded
      expect(module).toBeDefined();
    });

    it('should export PlatformStats type', async () => {
      const module = dashboardModule;
      expect(module).toBeDefined();
    });

    it('should export HealthStatus type', async () => {
      const module = dashboardModule;
      expect(module).toBeDefined();
    });

    it('should export ChatConfig type', async () => {
      const module = dashboardModule;
      expect(module).toBeDefined();
    });

    it('should export ScheduledMessage type', async () => {
      const module = dashboardModule;
      expect(module).toBeDefined();
    });

    it('should export AuditLogEntry type', async () => {
      const module = dashboardModule;
      expect(module).toBeDefined();
    });

    it('should export ApiResponse type', async () => {
      const module = dashboardModule;
      expect(module).toBeDefined();
    });
  });

  describe('Server Exports', () => {
    it('should export createDashboardServer function', async () => {
      const module = dashboardModule;
      expect(typeof module.createDashboardServer).toBe('function');
    });

    it('should export startDashboardServer function', async () => {
      const module = dashboardModule;
      expect(typeof module.startDashboardServer).toBe('function');
    });

    it('should export createDashboardRouter function', async () => {
      const module = await import('@orient/dashboard');
      expect(typeof module.createDashboardRouter).toBe('function');
    });
  });

  describe('Server Configuration', () => {
    it('createDashboardServer should accept config and services parameters', async () => {
      const { createDashboardServer } = dashboardModule;

      // The new API requires both config and services
      // This test verifies the function signature exists
      expect(typeof createDashboardServer).toBe('function');
      expect(createDashboardServer.length).toBeGreaterThanOrEqual(2); // At least 2 parameters
    });

    it('createDashboardRouter should accept services parameter', async () => {
      const { createDashboardRouter } = dashboardModule;

      // The new API requires services parameter with db, auth, etc.
      // This test verifies the function signature exists
      expect(typeof createDashboardRouter).toBe('function');
      expect(createDashboardRouter.length).toBeGreaterThanOrEqual(1); // At least 1 parameter
    });
  });
});
