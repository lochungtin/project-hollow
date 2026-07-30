import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// import Terminal from 'vite-plugin-terminal'

export default defineConfig({
  plugins: [
    react(),
    // Terminal({
    //   console: 'terminal',
    //   output: ['terminal', 'console']
    // })
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
})
