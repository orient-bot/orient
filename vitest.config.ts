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
    // setupFiles removed - src/ is deprecated, tests should use @orientbot/test-utils
    mockReset: true,
    restoreMocks: true,
    deps: {
      inline: [
        '@orientbot/mcp-tools',
        '@orientbot/agents',
        '@orientbot/integrations',
        '@orientbot/core',
        '@orientbot/database',
        '@orientbot/database-services',
        '@orientbot/bot-whatsapp',
        '@orientbot/bot-slack',
        '@orientbot/dashboard',
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      // Use source files directly for tests (no build required)
      '@orientbot/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@orientbot/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@orientbot/database-services': path.resolve(
        __dirname,
        'packages/database-services/src/index.ts'
      ),
      '@orientbot/agents': path.resolve(__dirname, 'packages/agents/src/index.ts'),
      '@orientbot/mcp-tools': path.resolve(__dirname, 'packages/mcp-tools/src/index.ts'),
      '@orientbot/bot-whatsapp': path.resolve(__dirname, 'packages/bot-whatsapp/src/index.ts'),
      '@orientbot/bot-slack': path.resolve(__dirname, 'packages/bot-slack/src/index.ts'),
      '@orientbot/api-gateway': path.resolve(__dirname, 'packages/api-gateway/src/index.ts'),
      '@orientbot/apps': path.resolve(__dirname, 'packages/apps/src/index.ts'),
      // Subpath aliases must come BEFORE the base package alias
      '@orientbot/integrations/catalog/github': path.resolve(
        __dirname,
        'packages/integrations/src/catalog/github/index.ts'
      ),
      '@orientbot/integrations/catalog/linear': path.resolve(
        __dirname,
        'packages/integrations/src/catalog/linear/index.ts'
      ),
      '@orientbot/integrations/jira': path.resolve(
        __dirname,
        'packages/integrations/src/jira/index.ts'
      ),
      '@orientbot/integrations/google': path.resolve(
        __dirname,
        'packages/integrations/src/google/index.ts'
      ),
      '@orientbot/integrations/gemini': path.resolve(
        __dirname,
        'packages/integrations/src/gemini/index.ts'
      ),
      '@orientbot/integrations/openai': path.resolve(
        __dirname,
        'packages/integrations/src/openai/index.ts'
      ),
      '@orientbot/integrations': path.resolve(__dirname, 'packages/integrations/src/index.ts'),
      '@orientbot/dashboard': path.resolve(__dirname, 'packages/dashboard/src/index.ts'),
      // Subpath aliases must come BEFORE the base package alias
      '@orientbot/mcp-servers/oauth': path.resolve(__dirname, 'packages/mcp-servers/src/oauth.ts'),
      '@orientbot/mcp-servers': path.resolve(__dirname, 'packages/mcp-servers/src/index.ts'),
      '@orientbot/test-utils': path.resolve(__dirname, 'packages/test-utils/src/index.ts'),
    },
  },
});
