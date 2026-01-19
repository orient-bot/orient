import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for assets
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../_shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
