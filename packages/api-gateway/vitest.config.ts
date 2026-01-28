import { defineConfig } from 'vitest/config';
import path from 'path';

const packagesDir = path.resolve(__dirname, '..');

export default defineConfig({
  resolve: {
    alias: {
      '@orientbot/core': path.resolve(packagesDir, 'core/src/index.ts'),
      '@orientbot/database': path.resolve(packagesDir, 'database/src/index.ts'),
      '@orientbot/database-services': path.resolve(packagesDir, 'database-services/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
