import { defineConfig } from 'vitest/config';
import path from 'path';

const runE2E = process.env.E2E_TESTS === 'true';
const runIntegration = process.env.INTEGRATION_TESTS === 'true';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    isolate: true,
    include: [
      'src/**/*.test.ts',
      'src/**/*.e2e.test.ts',
      'src/**/*.integration.test.ts',
      'tests/**/*.test.ts',
      'tests/**/*.e2e.test.ts',
      'tests/**/*.integration.test.ts',
    ],
    exclude: [
      ...(runE2E ? [] : ['**/*.e2e.test.ts']),
      ...(runIntegration ? [] : ['**/*.integration.test.ts', 'tests/integration/**']),
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__mocks__/**', 'src/types/**', 'src/index.ts'],
      // Coverage thresholds temporarily disabled
    },
    // setupFiles removed - src/ is deprecated, tests should use @orient/test-utils
    mockReset: true,
    restoreMocks: true,
    deps: {
      inline: [
        '@orient/mcp-tools',
        '@orient/agents',
        '@orient/integrations',
        '@orient/core',
        '@orient/database',
        '@orient/database-services',
        '@orient/bot-whatsapp',
        '@orient/bot-slack',
        '@orient/dashboard',
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      // Use source files directly for tests (no build required)
      '@orient/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@orient/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@orient/database-services': path.resolve(
        __dirname,
        'packages/database-services/src/index.ts'
      ),
      '@orient/agents': path.resolve(__dirname, 'packages/agents/src/index.ts'),
      '@orient/mcp-tools': path.resolve(__dirname, 'packages/mcp-tools/src/index.ts'),
      '@orient/bot-whatsapp': path.resolve(__dirname, 'packages/bot-whatsapp/src/index.ts'),
      '@orient/bot-slack': path.resolve(__dirname, 'packages/bot-slack/src/index.ts'),
      '@orient/api-gateway': path.resolve(__dirname, 'packages/api-gateway/src/index.ts'),
      '@orient/apps': path.resolve(__dirname, 'packages/apps/src/index.ts'),
      '@orient/integrations': path.resolve(__dirname, 'packages/integrations/src/index.ts'),
      '@orient/integrations/jira': path.resolve(
        __dirname,
        'packages/integrations/src/jira/index.ts'
      ),
      '@orient/integrations/google': path.resolve(
        __dirname,
        'packages/integrations/src/google/index.ts'
      ),
      '@orient/integrations/gemini': path.resolve(
        __dirname,
        'packages/integrations/src/gemini/index.ts'
      ),
      '@orient/integrations/openai': path.resolve(
        __dirname,
        'packages/integrations/src/openai/index.ts'
      ),
      '@orient/integrations/catalog/github': path.resolve(
        __dirname,
        'packages/integrations/src/catalog/github/index.ts'
      ),
      '@orient/integrations/catalog/linear': path.resolve(
        __dirname,
        'packages/integrations/src/catalog/linear/index.ts'
      ),
      '@orient/dashboard': path.resolve(__dirname, 'packages/dashboard/src/index.ts'),
      '@orient/test-utils': path.resolve(__dirname, 'packages/test-utils/src/index.ts'),
    },
  },
});
