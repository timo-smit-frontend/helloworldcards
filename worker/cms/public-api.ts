import { upcomingEvents } from '../../app/database/events'
import { isShopListed, toPublicProduct } from '../../app/database/products'
import type { CmsEvent, CmsFaq } from '../../app/cms/types'
import { buildLlmsDocument } from '../../app/seo/llms'
import { SITE_NAME, canonicalUrl, toAbsoluteUrl } from '../../app/seo/site'
import type { DashboardEnv, DashboardRuntime } from '../dashboard-api'
import { batchAll, rowToInventory, rowToPage, rowToSettings, SQL, type CmsDb, type PageRow, type ProductRow, type SettingsRow } from './db'
import { json, normalizeApiPath } from './http'
import { buildPublicPayload } from './public'
import { ensureSeeded, needsSeeding } from './seed'

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

/**
 * The published pages and shop products, plus what the llms documents add, read as one
 * batch. The seed check rides on the settings row that is part of the batch anyway.
 */
async function readSiteIndex(db: CmsDb) {
  const read = () =>
    batchAll(db, [
      db.prepare(SQL.settings),
      db.prepare(SQL.pages),
      db.prepare(SQL.shopInventory),
      db.prepare(SQL.events),
      db.prepare(SQL.faqs)
    ])

  let rows = await read()
  let settings = rowToSettings(rows[0].results[0] as SettingsRow | undefined)
  if (needsSeeding(settings)) {
    await ensureSeeded(db, settings)
    rows = await read()
    settings = rowToSettings(rows[0].results[0] as SettingsRow | undefined)
  }

  return {
    settings,
    pages: (rows[1].results as PageRow[]).map(rowToPage).filter((page) => page.status === 'published'),
    products: (rows[2].results as ProductRow[])
      .map(rowToInventory)
      .filter(isShopListed)
      .map((item) => toPublicProduct(item, item.slug)),
    events: rows[3].results as CmsEvent[],
    faqs: rows[4].results as CmsFaq[]
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
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

  const { pages, products } = await readSiteIndex(db)
  // Product photos ride along for Google Images, where a slab photo is often how a card is found.
  const entries = [
    ...pages.map((page) => ({ loc: canonicalUrl(page.path), images: [] as string[] })),
    ...products.map((product) => ({ loc: canonicalUrl(`/products/${product.slug}`), images: product.images.map(toAbsoluteUrl) }))
  ]
  const urls = entries.map(({ loc, images }) =>
    [
      '  <url>',
      `    <loc>${escapeXml(loc)}</loc>`,
      ...images.map((image) => `    <image:image>\n      <image:loc>${escapeXml(image)}</image:loc>\n    </image:image>`),
      '  </url>'
    ].join('\n')
  )

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
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

  const { settings, pages, products, events, faqs } = await readSiteIndex(db)
  if (!settings) {
    return null
  }

  const text = buildLlmsDocument(
    {
      siteName: SITE_NAME,
      siteDescription: settings.siteDescription,
      contactEmail: settings.contactEmail,
      marktplaatsUrl: settings.marktplaatsUrl,
      pages,
      products,
      events: upcomingEvents(events),
      faqs
    },
    path === '/llms-full.txt'
  )

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
    }
  })
}
