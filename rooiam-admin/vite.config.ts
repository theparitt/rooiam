import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Build timestamp (local time), injected at build time so the version badge
// shows when this bundle was built — handy for telling deploys apart.
const buildTime = new Date().toLocaleString('sv-SE', {
  timeZone: 'Asia/Bangkok',
}).replace(' ', ' ')

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { host: '0.0.0.0', port: 5171, strictPort: true },
  preview: { host: '0.0.0.0', port: 5171, strictPort: true },
})
