import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Base path only in production - dashboard is served at /dashboard/ via nginx
  // In dev mode, serve from root for proper hot-reload
  base: command === 'build' ? '/dashboard/' : '/',
  // Enable SPA fallback - required for client-side routing
  appType: 'spa',
  server: {
    // Listen on all interfaces so Docker can access it
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_PORT || '5173'),
    // Enable hot module replacement
    hmr: {
      // Use the actual host for HMR WebSocket connection
      host: 'localhost',
    },
    // Watch for file changes
    watch: {
      usePolling: false,
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/.dev-data/**',
        '**/.dev-pids/**',
        '**/logs/**',
        '**/.turbo/**',
        '**/dist/**',
        '**/apps/**/dist/**',
      ],
    },
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.DASHBOARD_PORT || '4098'}`,
        changeOrigin: true,
      },
      // Also proxy dashboard API calls in dev mode
      '/dashboard/api': {
        target: `http://localhost:${process.env.DASHBOARD_PORT || '4098'}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dashboard/, ''),
      },
      // Proxy QR/pairing routes to WhatsApp bot
      '/qr': {
        target: `http://localhost:${process.env.WHATSAPP_API_PORT || '4097'}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
