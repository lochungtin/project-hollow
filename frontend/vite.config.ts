import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev mode runs `npm run dev` (this server, port 5173) alongside
// `uvicorn app.main:app --reload` (port 8000) as two processes; the proxy
// below makes that indistinguishable from the production single-process
// deployment where FastAPI serves the built frontend directly (spec 11).
export default defineConfig({
  plugins: [react()],
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
