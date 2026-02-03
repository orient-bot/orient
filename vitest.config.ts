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
    // setupFiles removed - src/ is deprecated, tests should use @orient-bot/test-utils
    mockReset: true,
    restoreMocks: true,
    deps: {
      inline: [
        '@orient-bot/mcp-tools',
        '@orient-bot/agents',
        '@orient-bot/integrations',
        '@orient-bot/core',
        '@orient-bot/database',
        '@orient-bot/database-services',
        '@orient-bot/bot-whatsapp',
        '@orient-bot/bot-slack',
        '@orient-bot/dashboard',
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      // Use source files directly for tests (no build required)
      '@orient-bot/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@orient-bot/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@orient-bot/database-services': path.resolve(
        __dirname,
        'packages/database-services/src/index.ts'
      ),
      '@orient-bot/agents': path.resolve(__dirname, 'packages/agents/src/index.ts'),
      '@orient-bot/mcp-tools': path.resolve(__dirname, 'packages/mcp-tools/src/index.ts'),
      '@orient-bot/bot-whatsapp': path.resolve(__dirname, 'packages/bot-whatsapp/src/index.ts'),
      '@orient-bot/bot-slack': path.resolve(__dirname, 'packages/bot-slack/src/index.ts'),
      '@orient-bot/api-gateway': path.resolve(__dirname, 'packages/api-gateway/src/index.ts'),
      '@orient-bot/apps': path.resolve(__dirname, 'packages/apps/src/index.ts'),
      // Subpath aliases must come BEFORE the base package alias
      '@orient-bot/integrations/catalog/github': path.resolve(
        __dirname,
        'packages/integrations/src/catalog/github/index.ts'
      ),
      '@orient-bot/integrations/catalog/linear': path.resolve(
        __dirname,
        'packages/integrations/src/catalog/linear/index.ts'
      ),
      '@orient-bot/integrations/jira': path.resolve(
        __dirname,
        'packages/integrations/src/jira/index.ts'
      ),
      '@orient-bot/integrations/google': path.resolve(
        __dirname,
        'packages/integrations/src/google/index.ts'
      ),
      '@orient-bot/integrations/gemini': path.resolve(
        __dirname,
        'packages/integrations/src/gemini/index.ts'
      ),
      '@orient-bot/integrations/openai': path.resolve(
        __dirname,
        'packages/integrations/src/openai/index.ts'
      ),
      '@orient-bot/integrations': path.resolve(__dirname, 'packages/integrations/src/index.ts'),
      '@orient-bot/dashboard': path.resolve(__dirname, 'packages/dashboard/src/index.ts'),
      '@orient-bot/test-utils': path.resolve(__dirname, 'packages/test-utils/src/index.ts'),
    },
  },
});
