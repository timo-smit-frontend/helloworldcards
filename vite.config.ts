import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { applySeoHead } from './app/seo/head'
import { getSeoForPath } from './app/seo/pages'
import { buildSitemapXml, writeSeoBuild, writeSitemap } from './seo-prerender'
import { responsiveImagesPlugin } from './vite-responsive-images'

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
      writeSitemap(publicDir)

      server.middlewares.use((request, response, next) => {
        if (request.url !== '/sitemap.xml') {
          next()
          return
        }

        response.setHeader('Content-Type', 'application/xml; charset=utf-8')
        response.end(buildSitemapXml())
      })
    },
    transformIndexHtml(html) {
      return applySeoHead(html, getSeoForPath('/'))
    },
    buildStart() {
      writeSitemap(publicDir)
    },
    closeBundle() {
      writeSeoBuild(outDir)
    }
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), responsiveImagesPlugin(), seoPlugin()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app')
    }
  }
})
