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
      '@orient-bot/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@orient-bot/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@orient-bot/agents': path.resolve(__dirname, 'packages/agents/src/index.ts'),
      '@orient-bot/mcp-tools': path.resolve(__dirname, 'packages/mcp-tools/src/index.ts'),
      '@orient-bot/apps': path.resolve(__dirname, 'packages/apps/src/index.ts'),
      '@orient-bot/integrations': path.resolve(__dirname, 'packages/integrations/src/index.ts'),
      '@orient-bot/test-utils': path.resolve(__dirname, 'packages/test-utils/src/index.ts'),
    },
  },
});
