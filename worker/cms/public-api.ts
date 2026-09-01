import { upcomingEvents } from '../../app/database/events'
import { buildLlmsDocument } from '../../app/seo/llms'
import { SITE_NAME, canonicalUrl } from '../../app/seo/site'
import type { DashboardEnv, DashboardRuntime } from '../dashboard-api'
import type { CmsDb } from './db'
import { listEvents, listFaqs, listPages, listShopProducts, getSettings } from './db'
import { json, normalizeApiPath } from './http'
import { buildPublicPayload } from './public'
import { ensureSeeded } from './seed'

function dbOf(env: DashboardEnv, runtime?: DashboardRuntime): CmsDb | null {
  return runtime?.db ?? env.DB ?? null
}

export async function handlePublicApi(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response | null> {
  const url = new URL(request.url)
  const path = normalizeApiPath(url.pathname)
  if (path !== '/api/public' || request.method !== 'GET') {
    return null
  }

  const db = dbOf(env, runtime)
  if (!db) {
    return json({ error: 'Database is not available.' }, 503)
  }

  const payload = await buildPublicPayload(db, url.searchParams.get('path') || '/')
  return json(payload)
}

export async function handleSitemap(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response | null> {
  const path = normalizeApiPath(new URL(request.url).pathname)
  if (path !== '/sitemap.xml' || request.method !== 'GET') {
    return null
  }

  const db = dbOf(env, runtime)
  if (!db) {
    return null
  }

  await ensureSeeded(db)
  const pages = (await listPages(db)).filter((page) => page.status === 'published')
  const products = await listShopProducts(db)
  const urls = [...pages.map((page) => canonicalUrl(page.path)), ...products.map((product) => canonicalUrl(`/products/${product.slug}`))]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`).join('\n')}
</urlset>
`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
  })
}

export async function handleLlms(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response | null> {
  const path = normalizeApiPath(new URL(request.url).pathname)
  if ((path !== '/llms.txt' && path !== '/llms-full.txt') || request.method !== 'GET') {
    return null
  }

  const db = dbOf(env, runtime)
  if (!db) {
    return null
  }

  await ensureSeeded(db)
  const settings = await getSettings(db)
  if (!settings) {
    return null
  }

  const pages = (await listPages(db)).filter((page) => page.status === 'published')
  const text = buildLlmsDocument(
    {
      siteName: SITE_NAME,
      siteDescription: settings.siteDescription,
      contactEmail: settings.contactEmail,
      marktplaatsUrl: settings.marktplaatsUrl,
      pages,
      products: await listShopProducts(db),
      events: upcomingEvents(await listEvents(db)),
      faqs: await listFaqs(db)
    },
    path === '/llms-full.txt'
  )

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
  })
}
