import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * base defaults to '/' (the self-hosted agent app is served by Express at the
 * root). `npm run build:pages` sets VITE_BASE to the repo subpath for the
 * static GitHub Pages snapshot.
 */
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3090',
    },
  },
})
