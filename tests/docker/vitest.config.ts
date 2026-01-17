/**
 * Vitest configuration for Docker tests
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    testTimeout: 300000, // 5 minutes for Docker builds
    hookTimeout: 60000,
    globals: true,
    environment: 'node',
  },
});
