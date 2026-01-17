/**
 * Vitest Workspace Configuration
 * 
 * This file configures vitest to run tests across all packages in the monorepo.
 * It includes:
 * - Per-package test configurations
 * - Root-level integration and E2E tests
 * - Contract tests for package interfaces
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include both package tests and root-level tests
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'packages/*/__tests__/**/*.test.ts',
    ],
    exclude: [
      'src/**/*.e2e.test.ts',
      '**/node_modules/**',
    ],
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
  },
});
