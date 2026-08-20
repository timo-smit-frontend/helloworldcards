import fs from 'node:fs'
import path from 'node:path'
import { applySeoHead } from '../app/seo/head'
import { buildLlmsFullTxt, buildLlmsTxt } from '../app/seo/llms'
import { getIndexableSeoPages, getSeoForPath } from '../app/seo/pages'
import { canonicalUrl } from '../app/seo/site'

function toDistFile(distDir: string, pagePath: string): string {
  if (pagePath === '/') {
    return path.join(distDir, 'index.html')
  }

  return path.join(distDir, pagePath.slice(1), 'index.html')
}

const EMPTY_ROOT = '<div id="root"></div>'

function toHtmlImageAttrs(markup: string): string {
  return markup.replaceAll('srcSet=', 'srcset=').replaceAll('fetchPriority=', 'fetchpriority=')
}

export function injectRootMarkup(html: string, markup: string): string {
  if (!html.includes(EMPTY_ROOT)) {
    throw new Error(`Prerender expected ${EMPTY_ROOT} in the HTML template`)
  }

  return html.replace(EMPTY_ROOT, `<div id="root">${toHtmlImageAttrs(markup)}</div>`)
}

export async function writePrerenderedApp(distDir: string, render: (url: string) => Promise<string>): Promise<void> {
  const pages = [
    ...getIndexableSeoPages().map((page) => ({
      url: page.path,
      filePath: toDistFile(distDir, page.path)
    })),
    { url: '/404', filePath: path.join(distDir, '404.html') }
  ]

  for (const page of pages) {
    const html = fs.readFileSync(page.filePath, 'utf8')
    const markup = await render(page.url)
    fs.writeFileSync(page.filePath, injectRootMarkup(html, markup))
  }
}

export function buildSitemapXml(): string {
  const urls = getIndexableSeoPages()
    .map((page) => {
      const loc = page.canonical ?? canonicalUrl(page.path)
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

export function writeLlms(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'llms.txt'), buildLlmsTxt())
  fs.writeFileSync(path.join(dir, 'llms-full.txt'), buildLlmsFullTxt())
}

export function writeSeoPublic(dir: string): void {
  writeSitemap(dir)
  writeLlms(dir)
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
  writeSeoPublic(distDir)
}
