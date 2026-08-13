import fs from 'node:fs'
import path from 'node:path'
import { applySeoHead } from './app/seo/head'
import { getIndexableSeoPages, getSeoForPath } from './app/seo/pages'
import { SITE_URL } from './app/seo/site'

function toDistFile(distDir: string, pagePath: string): string {
  if (pagePath === '/') {
    return path.join(distDir, 'index.html')
  }

  return path.join(distDir, pagePath.slice(1), 'index.html')
}

export function buildSitemapXml(): string {
  const urls = getIndexableSeoPages()
    .map((page) => {
      const loc = page.path === '/' ? `${SITE_URL}/` : (page.canonical ?? `${SITE_URL}${page.path}`)
      return `  <url>\n    <loc>${loc}</loc>\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function writeSitemap(dir: string): string {
  const sitemapPath = path.join(dir, 'sitemap.xml')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(sitemapPath, buildSitemapXml())
  return sitemapPath
}

export function writeSeoBuild(distDir: string): void {
  const template = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')
  const pages = getIndexableSeoPages()

  for (const page of pages) {
    const filePath = toDistFile(distDir, page.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, applySeoHead(template, page))
  }

  fs.writeFileSync(path.join(distDir, '404.html'), applySeoHead(template, getSeoForPath('/404')))
  writeSitemap(distDir)
}
