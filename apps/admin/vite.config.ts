import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// A plain SPA — no SSR, no server runtime. Deployed as static files to
// Cloudflare Pages, the same hosting model as `site/`.

// The browser-tab icon says which environment you are looking at: the dev
// site gets the gold-on-gold mark, everything else the dark prod mark. The
// choice is made from VITE_ENV_LABEL, the same switch the header banner uses,
// so the two cannot disagree.
function environmentFavicon(envLabel: string): Plugin {
  const file = envLabel === 'dev' ? 'favicon-dev.png' : 'favicon-prod.png'
  return {
    name: 'environment-favicon',
    transformIndexHtml() {
      return [{ tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: `/${file}` }, injectTo: 'head' }]
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react(), environmentFavicon(env.VITE_ENV_LABEL ?? '')],
    resolve: {
      // Mirrors tsconfig.json's "paths" — that entry only satisfies the type
      // checker, this one is what actually makes Vite resolve `@/*` imports.
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
