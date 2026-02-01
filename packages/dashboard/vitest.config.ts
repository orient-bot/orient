import { defineConfig } from 'vitest/config';
import path from 'path';

const packagesDir = path.resolve(__dirname, '..');

export default defineConfig({
  resolve: {
    alias: {
      '@orient-bot/core': path.resolve(packagesDir, 'core/src/index.ts'),
      '@orient-bot/database': path.resolve(packagesDir, 'database/src/index.ts'),
      '@orient-bot/database-services': path.resolve(packagesDir, 'database-services/src/index.ts'),
      '@orient-bot/agents': path.resolve(packagesDir, 'agents/src/index.ts'),
      '@orient-bot/mcp-tools': path.resolve(packagesDir, 'mcp-tools/src/index.ts'),
      '@orient-bot/bot-whatsapp': path.resolve(packagesDir, 'bot-whatsapp/src/index.ts'),
      '@orient-bot/apps': path.resolve(packagesDir, 'apps/src/index.ts'),
      '@orient-bot/integrations/types': path.resolve(
        packagesDir,
        'integrations/src/types/integration.ts'
      ),
      '@orient-bot/integrations/google': path.resolve(
        packagesDir,
        'integrations/src/google/index.ts'
      ),
      '@orient-bot/integrations': path.resolve(packagesDir, 'integrations/src/index.ts'),
      '@orient-bot/mcp-servers/oauth': path.resolve(packagesDir, 'mcp-servers/src/oauth.ts'),
      '@orient-bot/mcp-servers': path.resolve(packagesDir, 'mcp-servers/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
