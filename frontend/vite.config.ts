import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import Terminal from 'vite-plugin-terminal';

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // dev-only: forwards browser console logs to the terminal running `vite dev`.
    // Its transformIndexHtml hook injects a dev-server-only virtual-module URL that
    // Rollup can't resolve during `vite build`, so it must not run for production builds.
    ...(command === 'serve' ? [Terminal({
      console: 'terminal',
      output: ['terminal', 'console']
    })] : [])
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/ws': {
        target: 'ws://127.0.0.1:5000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
}))
