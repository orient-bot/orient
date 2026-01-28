import { defineConfig } from 'vitest/config';
import path from 'path';

const packagesDir = path.resolve(__dirname, '..');

export default defineConfig({
  resolve: {
    alias: {
      '@orientbot/core': path.resolve(packagesDir, 'core/src/index.ts'),
      '@orientbot/database': path.resolve(packagesDir, 'database/src/index.ts'),
      '@orientbot/database-services': path.resolve(packagesDir, 'database-services/src/index.ts'),
      '@orientbot/agents': path.resolve(packagesDir, 'agents/src/index.ts'),
      '@orientbot/mcp-tools': path.resolve(packagesDir, 'mcp-tools/src/index.ts'),
      '@orientbot/bot-whatsapp': path.resolve(packagesDir, 'bot-whatsapp/src/index.ts'),
      '@orientbot/apps': path.resolve(packagesDir, 'apps/src/index.ts'),
      '@orientbot/integrations/types': path.resolve(
        packagesDir,
        'integrations/src/types/integration.ts'
      ),
      '@orientbot/integrations/google': path.resolve(
        packagesDir,
        'integrations/src/google/index.ts'
      ),
      '@orientbot/integrations': path.resolve(packagesDir, 'integrations/src/index.ts'),
      '@orientbot/mcp-servers/oauth': path.resolve(packagesDir, 'mcp-servers/src/oauth.ts'),
      '@orientbot/mcp-servers': path.resolve(packagesDir, 'mcp-servers/src/index.ts'),
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
