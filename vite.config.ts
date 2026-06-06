import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* to the local monitoring backend (server/index.mjs).
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
