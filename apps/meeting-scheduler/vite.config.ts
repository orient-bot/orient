import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Base path for assets - apps are served at /apps/<app-name>/
  base: '/apps/meeting-scheduler/',
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
