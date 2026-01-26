import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration for eval tests
 *
 * Runs agent evaluations as Vitest tests for integration with CI.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/eval/src/**/*.eval.test.ts'],
    // Longer timeout for LLM calls
    testTimeout: 120000,
    hookTimeout: 30000,
    // Run sequentially to avoid rate limits
    sequence: {
      concurrent: false,
    },
    setupFiles: ['./packages/eval/src/setup.ts'],
    mockReset: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': '/src',
      '@orientbot/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@orientbot/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@orientbot/agents': path.resolve(__dirname, 'packages/agents/src/index.ts'),
      '@orientbot/mcp-tools': path.resolve(__dirname, 'packages/mcp-tools/src/index.ts'),
      '@orientbot/apps': path.resolve(__dirname, 'packages/apps/src/index.ts'),
      '@orientbot/integrations': path.resolve(__dirname, 'packages/integrations/src/index.ts'),
      '@orientbot/test-utils': path.resolve(__dirname, 'packages/test-utils/src/index.ts'),
    },
  },
});
