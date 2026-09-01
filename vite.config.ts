import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type IndexHtmlTransformContext, type Plugin } from 'vite'
import { applySeoHead } from './app/seo/head'
import { getSeoForPath } from './app/seo/pages'
import { dashboardApiPlugin, stripProductCostsPlugin } from './vite/dashboard-api'
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
    host: true,
    allowedHosts: true
  },
  plugins: [
    react(),
    tailwindcss(),
    responsiveImagesPlugin(),
    stripProductCostsPlugin(),
    dashboardApiPlugin(),
    seoPlugin(),
    fontPreloadPlugin()
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app')
    }
  }
})
