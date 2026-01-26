import { defineConfig } from 'vitest/config';
import path from 'path';

const srcDir = path.resolve(__dirname, 'src');

export default defineConfig({
  resolve: {
    alias: {
      // Resolve .js imports to .ts source files for the eval package
      // These are needed because the source files use .js extensions for ESM compatibility
      './vitest-adapter.js': path.join(srcDir, 'vitest-adapter.ts'),
      './runner/index.js': path.join(srcDir, 'runner/index.ts'),
      './runner/loader.js': path.join(srcDir, 'runner/loader.ts'),
      './runner/loader-sync.js': path.join(srcDir, 'runner/loader-sync.ts'),
      './runner/assertions.js': path.join(srcDir, 'runner/assertions.ts'),
      './types.js': path.join(srcDir, 'types.ts'),
      '../types.js': path.join(srcDir, 'types.ts'),
      '../http-wrapper/server.js': path.join(srcDir, 'http-wrapper/server.ts'),
      '../http-wrapper/types.js': path.join(srcDir, 'http-wrapper/types.ts'),
      '../judge/index.js': path.join(srcDir, 'judge/index.ts'),
      '../mocks/index.js': path.join(srcDir, 'mocks/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.eval.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    testTimeout: 120000, // 2 minutes for eval runs
    hookTimeout: 60000,
  },
});
