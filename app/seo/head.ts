import type { SeoPage } from './pages'
import { SITE_LOCALE, SITE_NAME, SITE_THEME_COLOR } from './site'

const SEO_START = '<!--app-seo-start-->'
const SEO_END = '<!--app-seo-end-->'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function buildSeoHead(seo: SeoPage): string {
  const tags = [
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    `<meta name="robots" content="${escapeHtml(seo.robots)}" />`,
    `<meta name="theme-color" content="${SITE_THEME_COLOR}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="${SITE_LOCALE}" />`,
    `<meta property="og:type" content="${seo.type}" />`,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`,
    `<meta property="og:image" content="${escapeHtml(seo.image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(seo.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(seo.image)}" />`
  ]

  if (seo.canonical) {
    tags.splice(3, 0, `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`)
    tags.splice(8, 0, `<meta property="og:url" content="${escapeHtml(seo.canonical)}" />`)
  }

  tags.push(`<script id="seo-jsonld" type="application/ld+json">${serializeJsonLd(seo.jsonLd)}</script>`)

  return `${SEO_START}\n    ${tags.join('\n    ')}\n    ${SEO_END}`
}

export function applySeoHead(html: string, seo: SeoPage): string {
  const block = buildSeoHead(seo)

  if (html.includes(SEO_START) && html.includes(SEO_END)) {
    return html.replace(new RegExp(`${SEO_START}[\\s\\S]*?${SEO_END}`), block)
  }

  return html.replace(/<title>[^<]*<\/title>/i, block)
}
