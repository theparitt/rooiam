import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5184,
    strictPort: true,
    proxy: {
      // In local dev, proxy /api/* to candycloud-backend so cookies are same-origin.
      // The frontend uses VITE_API_URL=/api/v1 in .env.local when this proxy is active.
      '/api': {
        target: 'http://localhost:5185',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: { host: '0.0.0.0', port: 5184, strictPort: true },
})
