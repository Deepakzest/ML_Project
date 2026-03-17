import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/live-status': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: false,
        rewrite: (path) => path,
      },
        '/analyze': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: false,
        },
    },
  },
})
