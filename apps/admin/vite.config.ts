import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A plain SPA — no SSR, no server runtime. Deployed as static files to
// Cloudflare Pages, the same hosting model as `site/`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors tsconfig.json's "paths" — that entry only satisfies the type
    // checker, this one is what actually makes Vite resolve `@/*` imports.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
