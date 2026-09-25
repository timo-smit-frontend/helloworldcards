import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type IndexHtmlTransformContext, type Plugin } from 'vite'
import { applySeoHead } from './app/seo/head'
import { getSeoForPath } from './app/seo/pages'
import { CMS_SEED_FILES } from './vite/cms-state'
import { dashboardApiPlugin, stripProductCostsPlugin } from './vite/dashboard-api'
import { phoneAccessPlugin } from './vite/phone-access'
import { responsiveImagesPlugin } from './vite/responsive-images'

const FONT_START = '<!--app-font-start-->'
const FONT_END = '<!--app-font-end-->'
const OUTFIT_LATIN_FONT = /outfit-latin-wght-normal.*\.woff2$/

function buildFontPreloadTag(href: string): string {
  return `${FONT_START}\n    <link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />\n    ${FONT_END}`
}

function applyFontPreload(html: string, href: string | null): string {
  const block = href ? buildFontPreloadTag(href) : `${FONT_START}\n    ${FONT_END}`

  if (html.includes(FONT_START) && html.includes(FONT_END)) {
    return html.replace(new RegExp(`${FONT_START}[\\s\\S]*?${FONT_END}`), block)
  }

  return html
}

function outfitLatinHref(ctx: IndexHtmlTransformContext, base: string): string | null {
  const font = ctx.bundle
    ? Object.values(ctx.bundle).find((item) => item.type === 'asset' && OUTFIT_LATIN_FONT.test(item.fileName))
    : undefined

  if (!font || font.type !== 'asset') {
    return null
  }

  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}${font.fileName}`
}

function moveModuleScriptsToBody(html: string): string {
  const scripts = [...html.matchAll(/<script type="module"[^>]*><\/script>\n?/g)].map((match) => match[0].trim())
  if (scripts.length === 0) return html

  let next = html
  for (const script of scripts) {
    next = next.replace(script, '')
  }

  const deferred = scripts.map((script) =>
    script.includes('fetchpriority=') ? script : script.replace('<script ', '<script fetchpriority="low" ')
  )

  return next.replace('</body>', `    ${deferred.join('\n    ')}\n  </body>`)
}

function fontPreloadPlugin(): Plugin {
  let base = '/'

  return {
    name: 'font-preload',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        return moveModuleScriptsToBody(applyFontPreload(html, outfitLatinHref(ctx, base)))
      }
    }
  }
}

function seoPlugin(): Plugin {
  return {
    name: 'seo-shell',
    transformIndexHtml(html) {
      return applySeoHead(html, getSeoForPath('/'))
    }
  }
}

export default defineConfig({
  base: '/',
  server: {
    // This computer only. Listening on every network handed `.dev.vars`, the local
    // database and the scan reports to anyone on the same Wi-Fi; the phone reaches the
    // admin through Tailscale instead (`vite/phone-access.ts`), which passes its requests
    // on from here. `.ts.net` is the address Tailscale gives it.
    host: '127.0.0.1',
    allowedHosts: ['.ts.net'],
    fs: {
      // Vite's own list, plus the files that hold secrets and data rather than code.
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '.dev.vars', '.dev.vars.*', '**/.wrangler/**', '**/.cache/**']
    },
    watch: {
      // The CMS auto-sync rewrites these after every admin edit. `seed-products.ts` is
      // reached from this config through the worker's seeding code, which makes it a
      // config dependency: Vite would restart the server on every write and reload the
      // admin mid-edit. The files only feed an empty database, so a running server has
      // no reason to notice them.
      //
      // `app/cms/seed-media.ts` is a config dependency the same way, and the sync
      // rewrites it when a sold card's committed photos leave `seed/media`.
      //
      // `.cache` holds the scan Chrome profile and the saved scan reports. Chrome keeps
      // its session files locked while it runs, and on Windows watching a locked file
      // fails with EBUSY — which the watcher raises as a fatal error, taking the whole
      // dev server down a few seconds into every Cardmarket scan.
      ignored: [...Object.values(CMS_SEED_FILES).map((file) => `**/${file}`), '**/app/cms/seed-media.ts', '**/.cache/**', '**/.wrangler/**']
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    responsiveImagesPlugin(),
    stripProductCostsPlugin(),
    dashboardApiPlugin(),
    phoneAccessPlugin(),
    seoPlugin(),
    fontPreloadPlugin()
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app')
    }
  }
})
