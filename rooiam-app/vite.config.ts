import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // demo-local runs on 5182, prod-local on 5172 (online modes are build-only)
  const port = mode === 'demo-local' ? 5182 : 5172

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: { host: '0.0.0.0', port, strictPort: true },
    preview: { host: '0.0.0.0', port, strictPort: true },
  }
})
