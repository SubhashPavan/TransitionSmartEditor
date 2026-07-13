import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5190,
    proxy: {
      // Proxy /api → sop-editor backend (Python FastAPI on :8002).
      // changeOrigin lets Azure Blob SAS URLs returned through the API
      // work directly from the browser without CORS gymnastics.
      '/api': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
})
