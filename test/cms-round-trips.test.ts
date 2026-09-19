import { describe, expect, it } from 'vitest'
import { handleAdminRequest } from '../worker/cms/admin-api'
import type { CmsDb, CmsPreparedStatement } from '../worker/cms/db'
import { getProductById, getSettings } from '../worker/cms/db'
import { buildPublicPayload } from '../worker/cms/public'
import { handleLlms, handleSitemap } from '../worker/cms/public-api'
import { CMS_SEED_VERSION, ensureSeeded } from '../worker/cms/seed'
import { handleDashboardRequest } from '../worker/dashboard-api'
import { SESSION_COOKIE } from '../worker/session'
import { createMemoryD1 } from './helpers/memory-d1'

const env = {
  DASHBOARD_USERNAME: 'sam',
  DASHBOARD_PASSWORD: 'correct-horse',
  DASHBOARD_SESSION_SECRET: 'session-secret-for-tests'
}

const ADMIN = 'https://admin.helloworldcards.com'

type Tracked = { db: CmsDb; trips: string[] }

/**
 * A database that records every trip made to it: one entry per statement executed on its
 * own, and one entry per batch however many statements it carries. That is what a request
 * pays for on D1, where the round trip dwarfs the query.
 */
function trackedDb(): Tracked {
  const inner = createMemoryD1()
  const trips: string[] = []
  type Wrapped = CmsPreparedStatement & { inner: ReturnType<typeof inner.prepare> }

  const wrap = (statement: ReturnType<typeof inner.prepare>, query: string): Wrapped => ({
    inner: statement,
    bind: (...params: unknown[]) => wrap(statement.bind(...(params as Parameters<typeof statement.bind>)), query),
    first: async <T>() => {
      trips.push(`first ${query.split(' ').slice(0, 4).join(' ')}`)
      return statement.first<T>()
    },
    all: async <T>() => {
      trips.push(`all ${query.split(' ').slice(0, 4).join(' ')}`)
      return statement.all<T>()
    },
    run: async () => {
      trips.push(`run ${query.split(' ').slice(0, 4).join(' ')}`)
      return statement.run()
    }
  })

  const db: CmsDb = {
    prepare: (query) => wrap(inner.prepare(query), query),
    batch: async <T>(statements: CmsPreparedStatement[]) => {
      trips.push(`batch of ${statements.length}`)
      return inner.batch<T>(statements.map((statement) => (statement as Wrapped).inner))
    }
  }

  return { db, trips }
}

async function seeded(): Promise<Tracked> {
  const tracked = trackedDb()
  await ensureSeeded(tracked.db)
  tracked.trips.length = 0
  return tracked
}

async function signIn(db: CmsDb): Promise<string> {
  const login = await handleDashboardRequest(
    new Request(`${ADMIN}/api/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
    }),
    env,
    { db }
  )
  const header = login!.headers.get('Set-Cookie') ?? ''
  return header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1] ?? ''
}

describe('database round trips', () => {
  it('never offers a reserved or sold card as a similar product', async () => {
    const { db } = await seeded()
    const home = await buildPublicPayload(db, '/')
    const [reserved, sold, ...rest] = home.products
    await db.prepare('UPDATE products SET reserved = 1 WHERE id = ?').bind(reserved.id).run()
    await db.prepare('UPDATE products SET sold = 1 WHERE id = ?').bind(sold.id).run()

    for (let attempt = 0; attempt < 40; attempt++) {
      const page = await buildPublicPayload(db, `/products/${rest[0].slug}`)
      expect(page.similarProductIds).not.toContain(reserved.id)
      expect(page.similarProductIds).not.toContain(sold.id)
      expect(page.similarProductIds).not.toContain(rest[0].id)
    }
  })

  it('renders a page from a single batch once the database is seeded', async () => {
    const { db, trips } = await seeded()

    const home = await buildPublicPayload(db, '/')
    expect(home.notFound).toBe(false)
    expect(home.page?.path).toBe('/')
    expect(home.products.length).toBeGreaterThan(0)
    expect(trips).toEqual(['batch of 7'])

    trips.length = 0
    const product = await buildPublicPayload(db, `/products/${home.products[0].slug}`)
    expect(product.product?.slug).toBe(home.products[0].slug)
    expect(product.similarProductIds).not.toContain(product.product?.id)
    expect(trips).toEqual(['batch of 7'])

    trips.length = 0
    const missing = await buildPublicPayload(db, '/nowhere')
    expect(missing.notFound).toBe(true)
    expect(trips).toEqual(['batch of 7'])
  })

  it('seeds an empty database from the first page read and never writes again', async () => {
    const { db, trips } = trackedDb()

    const first = await buildPublicPayload(db, '/')
    expect(first.notFound).toBe(false)
    expect(trips.some((trip) => trip.startsWith('run INSERT OR IGNORE'))).toBe(true)

    trips.length = 0
    await buildPublicPayload(db, '/')
    await ensureSeeded(db)
    expect(trips.filter((trip) => trip.startsWith('run '))).toEqual([])
    expect(trips).toEqual(['batch of 7', 'first SELECT json FROM settings'])
  })

  it('reads the sitemap and llms documents in one batch each', async () => {
    const { db, trips } = await seeded()

    const sitemap = await handleSitemap(new Request('https://helloworldcards.com/sitemap.xml'), {}, { db })
    expect(sitemap?.status).toBe(200)
    expect(trips).toEqual(['batch of 5'])

    trips.length = 0
    const llms = await handleLlms(new Request('https://helloworldcards.com/llms.txt'), {}, { db })
    expect(llms?.status).toBe(200)
    expect(trips).toEqual(['batch of 5'])
  })

  it('serves the ledger from one batch', async () => {
    const { db, trips } = await seeded()
    const token = await signIn(db)
    trips.length = 0

    const ledger = await handleDashboardRequest(
      new Request(`${ADMIN}/api/admin/ledger`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    expect(ledger?.status).toBe(200)
    expect(trips).toEqual(['batch of 2'])
  })

  it('answers the admin settings and media screens with one read each after the seed check', async () => {
    const { db, trips } = await seeded()
    const token = await signIn(db)
    const headers = { Cookie: `${SESSION_COOKIE}=${token}` }
    trips.length = 0

    const settings = await handleAdminRequest(new Request(`${ADMIN}/api/admin/settings`, { headers }), env, { db })
    expect(settings?.status).toBe(200)
    expect(trips).toEqual(['first SELECT json FROM settings', 'batch of 2'])

    trips.length = 0
    const media = await handleAdminRequest(new Request(`${ADMIN}/api/admin/media`, { headers }), env, { db, media: memoryBucket() })
    expect(media?.status).toBe(200)
    expect(trips).toEqual(['first SELECT json FROM settings', 'batch of 4'])
  })

  it('swaps the navigation in one batch and returns the rows with their ids', async () => {
    const { db, trips } = await seeded()
    const token = await signIn(db)
    trips.length = 0

    const saved = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({
          siteDescription: 'A tiny shop',
          nav: [
            { location: 'header', label: 'Home', href: '/' },
            { location: 'footer', label: 'Contact', href: '/contact/' }
          ]
        })
      }),
      env,
      { db }
    )
    expect(saved?.status).toBe(200)
    const body = (await saved!.json()) as { nav: Array<{ id: number; label: string }> }
    // Rows come back in the order the site reads them: by location, footer first.
    expect(body.nav.map((item) => item.label)).toEqual(['Contact', 'Home'])
    expect(body.nav.every((item) => typeof item.id === 'number' && item.id > 0)).toBe(true)
    // Seed check, current settings, the settings write, then delete + 2 inserts + read-back as one batch.
    expect(trips).toEqual([
      'first SELECT json FROM settings',
      'first SELECT json FROM settings',
      'run INSERT INTO settings (id,',
      'batch of 4'
    ])
  })

  it('keeps the seed version, and so the admin edits, across a settings save', async () => {
    const { db } = await seeded()
    const token = await signIn(db)
    const headers = { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` }

    const mewtwo = (await getProductById(db, 1))!
    expect(mewtwo.price).toBe('€90')
    const edited = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/1`, { method: 'PUT', headers, body: JSON.stringify({ ...mewtwo, price: '€80' }) }),
      env,
      { db }
    )
    expect(edited?.status).toBe(200)

    const saved = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/settings`, { method: 'PUT', headers, body: JSON.stringify({ siteDescription: 'Changed' }) }),
      env,
      { db }
    )
    expect(saved?.status).toBe(200)
    expect((await getSettings(db))?.cmsSeedVersion).toBe(CMS_SEED_VERSION)

    // A dropped version would have the next request replay the seed migrations, and the
    // product sync among them would put the seed price back.
    const payload = await buildPublicPayload(db, '/')
    expect(payload.products.find((product) => product.id === 1)?.price).toBe('€80')
    expect((await getProductById(db, 1))?.price).toBe('€80')
  })
})

function memoryBucket() {
  return {
    async put() {
      return {}
    },
    async get() {
      return null
    },
    async delete() {}
  }
}
