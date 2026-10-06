import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { CATALOGUE_ENABLED } from './shared/features.ts'

const root = path.dirname(fileURLToPath(import.meta.url))
const CATALOGUE_IMAGES = path.join(root, 'catalogue', 'images')

/**
 * The bundled artwork set is ~64 MB of WebP, so it lives in `catalogue/` rather
 * than `public/` and is only served or copied into a build when the catalogue
 * flag is on. With the flag off the app ships no images at all — every card the
 * user sees comes from the agent's live-wiki search.
 */
function catalogueImages() {
  return {
    name: 'catalogue-images',

    // Dev server: expose catalogue/images at /images.
    configureServer(server: { middlewares: { use: (route: string, fn: unknown) => void } }) {
      if (!CATALOGUE_ENABLED) return
      server.middlewares.use('/images', (req: { url?: string }, res: NodeJS.WritableStream & { setHeader: (k: string, v: string) => void }, next: () => void) => {
        const name = path.basename(decodeURIComponent((req.url ?? '').split('?')[0]))
        if (!/^[A-Za-z0-9._-]+$/.test(name)) return next()
        const file = path.join(CATALOGUE_IMAGES, name)
        if (!fs.existsSync(file)) return next()
        res.setHeader('Content-Type', 'image/webp')
        fs.createReadStream(file).pipe(res)
      })
    },

    // Production build: copy the images into dist so Express can serve them.
    closeBundle() {
      if (!CATALOGUE_ENABLED || !fs.existsSync(CATALOGUE_IMAGES)) return
      fs.cpSync(CATALOGUE_IMAGES, path.join(root, 'dist', 'images'), { recursive: true })
    },
  }
}

/**
 * base defaults to '/' (the self-hosted agent app is served by Express at the
 * root). `npm run build:pages` sets VITE_BASE to the repo subpath for the
 * static GitHub Pages snapshot.
 */
export default defineConfig({
  plugins: [react(), catalogueImages()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3090',
    },
  },
})
