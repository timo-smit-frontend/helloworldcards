import { applySeoHead } from '../../app/seo/head'
import { adminSeo, getSeoForPayload } from '../../app/seo/cms'
import type { PublicCmsPayload } from '../../app/cms/types'

const CMS_SCRIPT_START = '<!--app-cms-start-->'
const CMS_SCRIPT_END = '<!--app-cms-end-->'

export function injectCmsPayload(html: string, payload: PublicCmsPayload | null, options: { admin?: boolean; path: string }): string {
  const seo = options.admin ? adminSeo() : getSeoForPayload(options.path, payload)
  let next = applySeoHead(html, seo)
  const json = payload ? JSON.stringify(payload).replace(/</g, '\\u003c') : 'null'
  const script = `${CMS_SCRIPT_START}<script>window.__CMS__=${json}</script>${CMS_SCRIPT_END}`

  if (next.includes(CMS_SCRIPT_START) && next.includes(CMS_SCRIPT_END)) {
    next = next.replace(new RegExp(`${CMS_SCRIPT_START}[\\s\\S]*?${CMS_SCRIPT_END}`), script)
  } else {
    next = next.replace('</head>', `    ${script}\n  </head>`)
  }

  return next
}

export function applyAdminRobots(html: string): string {
  return html
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/i, '<meta name="robots" content="noindex, nofollow, noarchive" />')
    .replace(/<link rel="canonical"[^>]*>\s*/i, '')
    .replace(/<meta property="og:url"[^>]*>\s*/i, '')
    .replace(/<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/i, '')
}
