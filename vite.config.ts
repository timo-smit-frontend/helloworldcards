import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type IndexHtmlTransformContext, type Plugin } from 'vite'
import { applySeoHead } from './app/seo/head'
import { buildLlmsFullTxt, buildLlmsTxt } from './app/seo/llms'
import { getSeoForPath } from './app/seo/pages'
import { buildSitemapXml, writePrerenderedApp, writeSeoBuild, writeSeoPublic } from './vite/seo-prerender'
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
  let publicDir = ''
  let outDir = ''

  return {
    name: 'seo-prerender',
    configResolved(config) {
      publicDir = config.publicDir
      outDir = path.resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      writeSeoPublic(publicDir)

      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0]

        if (url === '/sitemap.xml') {
          response.setHeader('Content-Type', 'application/xml; charset=utf-8')
          response.end(buildSitemapXml())
          return
        }

        if (url === '/llms.txt') {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8')
          response.end(buildLlmsTxt())
          return
        }

        if (url === '/llms-full.txt') {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8')
          response.end(buildLlmsFullTxt())
          return
        }

        next()
      })
    },
    transformIndexHtml(html) {
      return applySeoHead(html, getSeoForPath('/'))
    },
    buildStart() {
      writeSeoPublic(publicDir)
    },
    async closeBundle() {
      if (process.env.HWC_PRERENDER === '1') {
        return
      }

      writeSeoBuild(outDir)

      process.env.HWC_PRERENDER = '1'
      const { createServer } = await import('vite')
      const vite = await createServer({
        server: { middlewareMode: true, hmr: false, watch: null },
        appType: 'custom',
        mode: 'production'
      })

      try {
        const { render } = (await vite.ssrLoadModule('/app/entry-server.tsx')) as {
          render: (url: string) => Promise<string>
        }
        await writePrerenderedApp(outDir, render)
      } finally {
        await vite.close()
        delete process.env.HWC_PRERENDER
      }
    }
  }
}

export default defineConfig({
  base: '/',
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
