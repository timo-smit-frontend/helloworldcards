import { describe, expect, it } from 'vitest'
import { CACHE_VERSION } from '../app/services/deal-finder/cache'
import type { VintedRelistService } from '../app/services/vinted-relist'
import { handleDashboardRequest, memoryCardmarketStore, memoryDealFinderStore, type CmsSync } from '../worker/dashboard-api'
import { SESSION_COOKIE } from '../worker/session'
import { createMemoryD1 } from './helpers/memory-d1'

const env = {
  DASHBOARD_USERNAME: 'sam',
  DASHBOARD_PASSWORD: 'correct-horse',
  DASHBOARD_SESSION_SECRET: 'session-secret-for-tests'
}

function seededRuntime(extra: Record<string, unknown> = {}) {
  return { db: createMemoryD1(), ...extra }
}

function cookieFrom(response: Response): string {
  const header = response.headers.get('Set-Cookie') ?? ''
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  return match?.[1] ?? ''
}

async function signIn(): Promise<string> {
  const login = await handleDashboardRequest(
    new Request('https://example.com/dashboard/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
    }),
    env
  )
  return cookieFrom(login!)
}

/** A stand-in for the dev server's sync: records each settle, and fails while told to. */
function fakeSync(failure: string | null = null): CmsSync & { settles: string[]; fail(message: string | null): void } {
  const settles: string[] = []
  let error: { at: string; message: string } | null = null
  return {
    settles,
    fail(message) {
      failure = message
    },
    async settle() {
      settles.push('settle')
      if (failure) {
        error = { at: '2026-09-15T09:02:00.000Z', message: failure }
        throw new Error(failure)
      }
      error = null
    },
    status() {
      return { settledAt: settles.length > 0 && !error ? '2026-09-15T09:02:31.163Z' : null, error }
    }
  }
}

describe('dashboard API', () => {
  it('refuses to start when credentials are missing from env', async () => {
    const response = await handleDashboardRequest(new Request('https://example.com/dashboard/session', { method: 'POST' }), {})

    expect(response?.status).toBe(503)
    await expect(response?.json()).resolves.toEqual({ error: 'Sign in is not available.' })
  })

  it('does not handle public shop routes', async () => {
    const response = await handleDashboardRequest(new Request('https://example.com/products/'), env)
    expect(response).toBeNull()
  })

  it('rejects the wrong password without setting a session', async () => {
    const response = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'sam', password: 'nope' })
      }),
      env
    )

    expect(response?.status).toBe(401)
    expect(response?.headers.get('Set-Cookie')).toBeNull()
  })

  it('sets a session cookie for the env credentials and returns the ledger', async () => {
    const runtime = seededRuntime()
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )

    expect(login?.status).toBe(200)
    const token = cookieFrom(login!)
    expect(token).not.toBe('')

    const ledger = await handleDashboardRequest(
      new Request('https://example.com/dashboard/ledger/', {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      runtime
    )

    expect(ledger?.status).toBe(200)
    const body = (await ledger!.json()) as {
      spending: number
      potentialGain: number
      items: Array<{ sold: boolean; soldAt: string | null }>
    }
    expect(body.spending).toBeGreaterThan(0)
    expect(typeof body.potentialGain).toBe('number')
    expect(body.items.length).toBeGreaterThan(0)
    expect(body.items.every((item) => typeof item.sold === 'boolean')).toBe(true)
  })

  it('hides the ledger from signed-out requests', async () => {
    const response = await handleDashboardRequest(new Request('https://example.com/dashboard/ledger'), env)
    expect(response?.status).toBe(401)
  })

  it('returns an empty Cardmarket report until a scan has run', async () => {
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )
    const token = cookieFrom(login!)
    const store = memoryCardmarketStore()
    const runtime = seededRuntime({ cardmarketStore: store })

    const signedOut = await handleDashboardRequest(new Request('https://example.com/dashboard/cardmarket/report'), env, runtime)
    expect(signedOut?.status).toBe(401)

    const signedIn = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cardmarket/report', {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      runtime
    )

    expect(signedIn?.status).toBe(200)
    await expect(signedIn?.json()).resolves.toEqual({ report: null })
  })

  it('serves a saved report without the cards reserved or sold since it was scanned', async () => {
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )
    const token = cookieFrom(login!)
    const store = memoryCardmarketStore()
    const entry = (id: number, title: string) => ({
      id,
      title,
      image: null,
      listed: 95,
      url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Generations/Charizard-GENRC5',
      listings: [],
      competitors: [],
      suggestion: null,
      gone: [],
      error: null
    })
    // Charizard (3) has sold and Poke Kid (9) is reserved in the seed; Ekans (4) is still for sale.
    await store.putReport({
      scannedAt: '2026-09-13T12:00:00.000Z',
      products: [entry(3, 'Charizard'), entry(4, 'Ekans'), entry(9, 'Poke Kid')]
    })

    const response = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cardmarket/report', { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      seededRuntime({ cardmarketStore: store })
    )

    expect(response?.status).toBe(200)
    const body = (await response!.json()) as { report: { products: Array<{ id: number; title: string }> } }
    expect(body.report.products.map((product) => product.title)).toEqual(['Ekans'])
  })

  it('scans watchable cards and stores suggestions', async () => {
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )
    const token = cookieFrom(login!)
    const store = memoryCardmarketStore()
    const urls: string[] = []
    const runtime = seededRuntime({
      cardmarketStore: store,
      fetchCardmarketPage: async (url: string) => {
        urls.push(url)
        return `
            <div id="articleRow1" class="article-row">
              <a href="/en/Pokemon/Users/CatDoesThings">CatDoesThings</a>
              <span>PSA 9</span>
              <span>100,00 €</span>
            </div>
          `
      }
    })

    const scan = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cardmarket/scan', { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      runtime
    )

    expect(scan?.status).toBe(200)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((url) => /minCondition=[12]/.test(url))).toBe(true)
    expect(urls.some((url) => url.includes('minCondition=1'))).toBe(true)

    const body = (await scan!.json()) as {
      report: { products: Array<{ title: string; image: string | null; suggestion: { direction: string; target: number } | null }> }
    }
    const ekans = body.report.products.find((product) => product.title === 'Ekans')
    expect(ekans?.image).toBe('/media/76645522_front.jpg')
    expect(ekans?.suggestion).toEqual(expect.objectContaining({ direction: 'up', target: 100 }))
  })

  it('brings the local database in step with production before scanning it', async () => {
    const token = await signIn()
    const sync = fakeSync()
    const order: string[] = []
    const runtime = seededRuntime({
      cardmarketStore: memoryCardmarketStore(),
      cmsSync: {
        ...sync,
        async settle() {
          order.push('settle')
          await sync.settle()
        }
      },
      fetchCardmarketPage: async () => {
        order.push('fetch')
        return '<div id="articleRow1" class="article-row"><span>PSA 10</span><span>100,00 €</span></div>'
      }
    })

    const scan = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cardmarket/scan', { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      runtime
    )

    expect(scan?.status).toBe(200)
    expect(order[0]).toBe('settle')
    expect(order.filter((step) => step === 'settle')).toHaveLength(1)
    expect(order.filter((step) => step === 'fetch').length).toBeGreaterThan(0)
  })

  it('does not scan while the local database cannot be brought in step with production', async () => {
    const token = await signIn()
    const store = memoryCardmarketStore()
    const fetched: string[] = []
    const runtime = seededRuntime({
      cardmarketStore: store,
      cmsSync: fakeSync('vite-node is not installed. Run `npm install`.'),
      fetchCardmarketPage: async (url: string) => {
        fetched.push(url)
        return ''
      }
    })

    const scan = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cardmarket/scan', { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      runtime
    )

    expect(scan?.status).toBe(503)
    await expect(scan?.json()).resolves.toEqual({
      error:
        'The local database could not be brought in step with production, so nothing was done: vite-node is not installed. Run `npm install`.'
    })
    expect(fetched).toEqual([])
    expect(await store.getReport()).toBeNull()
  })

  it('tells the admin how the sync with production is doing, and settles on request', async () => {
    const token = await signIn()
    const sync = fakeSync('production database has no column reserved yet')
    const runtime = seededRuntime({ cmsSync: sync })
    const headers = { Cookie: `${SESSION_COOKIE}=${token}` }

    const quiet = await handleDashboardRequest(new Request('https://example.com/dashboard/cms-sync', { headers }), env, runtime)
    expect(quiet?.status).toBe(200)
    await expect(quiet?.json()).resolves.toEqual({ sync: { settledAt: null, error: null } })

    const failed = await handleDashboardRequest(
      new Request('https://example.com/api/admin/cms-sync', { method: 'POST', headers }),
      env,
      runtime
    )
    expect(failed?.status).toBe(503)
    await expect(failed?.json()).resolves.toEqual({
      error:
        'The local database could not be brought in step with production, so nothing was done: production database has no column reserved yet',
      sync: { settledAt: null, error: { at: '2026-09-15T09:02:00.000Z', message: 'production database has no column reserved yet' } }
    })

    sync.fail(null)
    const settled = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cms-sync', { method: 'POST', headers }),
      env,
      runtime
    )
    expect(settled?.status).toBe(200)
    await expect(settled?.json()).resolves.toEqual({ sync: { settledAt: '2026-09-15T09:02:31.163Z', error: null } })
    expect(sync.settles).toHaveLength(2)
  })

  it('has no sync to report on the live worker', async () => {
    const token = await signIn()
    const headers = { Cookie: `${SESSION_COOKIE}=${token}` }
    const status = await handleDashboardRequest(new Request('https://example.com/dashboard/cms-sync', { headers }), env, seededRuntime())
    await expect(status?.json()).resolves.toEqual({ sync: null })

    const settle = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cms-sync', { method: 'POST', headers }),
      env,
      seededRuntime()
    )
    expect(settle?.status).toBe(404)
  })

  it('does not relist while the local database cannot be brought in step with production', async () => {
    const token = await signIn()
    const calls: string[] = []
    const vintedRelist: VintedRelistService = {
      async report() {
        return {
          rows: [],
          pending: [],
          missing: [],
          byHand: [],
          relisting: [],
          fetchedAt: '2026-09-15T09:00:00Z'
        }
      },
      async relist(itemId) {
        calls.push(itemId)
        return { itemId: '9999', url: 'https://www.vinted.nl/items/9999', productId: null }
      }
    }
    // The reserved check in the relist reads the local rows, so a stale database would let a sold card back up.
    const runtime = seededRuntime({ vintedRelist, cmsSync: fakeSync('getaddrinfo ENOTFOUND api.cloudflare.com') })

    const response = await handleDashboardRequest(
      new Request('https://example.com/api/admin/vinted-relist/10003961594', {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      runtime
    )

    expect(response?.status).toBe(503)
    await expect(response?.json()).resolves.toEqual({
      error:
        'The local database could not be brought in step with production, so nothing was done: getaddrinfo ENOTFOUND api.cloudflare.com'
    })
    expect(calls).toEqual([])
  })

  it('does not scan Cardmarket on the live worker without a local page fetcher', async () => {
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )
    const token = cookieFrom(login!)
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('live Cardmarket scans should not fetch pages')
    }) as typeof fetch

    try {
      const scan = await handleDashboardRequest(
        new Request('https://example.com/dashboard/cardmarket/scan', {
          method: 'POST',
          headers: { Cookie: `${SESSION_COOKIE}=${token}` }
        }),
        env,
        { cardmarketStore: memoryCardmarketStore() }
      )

      expect(scan?.status).toBe(404)
      await expect(scan?.json()).resolves.toEqual({ error: 'Cardmarket scan is only available locally.' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns an empty deal finder report until a scan has run', async () => {
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )
    const token = cookieFrom(login!)
    const store = memoryDealFinderStore()
    const runtime = seededRuntime({ dealFinderStore: store })

    const response = await handleDashboardRequest(
      new Request('https://example.com/dashboard/deal-finder/report', {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      runtime
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({ report: null })
  })

  it('does not run the deal finder on the live worker without a local page fetcher', async () => {
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )
    const token = cookieFrom(login!)

    const scan = await handleDashboardRequest(
      new Request('https://example.com/dashboard/deal-finder/scan', {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { dealFinderStore: memoryDealFinderStore() }
    )

    expect(scan?.status).toBe(404)
    await expect(scan?.json()).resolves.toEqual({ error: 'The deal finder only runs locally.' })
  })

  it('gives each marketplace its own deal finder scan route', async () => {
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )
    const token = cookieFrom(login!)

    for (const source of ['marktplaats', 'vinted']) {
      const scan = await handleDashboardRequest(
        new Request(`https://example.com/dashboard/deal-finder/scan/${source}`, {
          method: 'POST',
          headers: { Cookie: `${SESSION_COOKIE}=${token}` }
        }),
        env,
        { dealFinderStore: memoryDealFinderStore() }
      )

      // Recognised as a scan route — it gets as far as needing the local Chrome window.
      expect(scan?.status).toBe(404)
      await expect(scan?.json()).resolves.toEqual({ error: 'The deal finder only runs locally.' })
    }

    // A marketplace we do not scan is not a route at all.
    const unknown = await handleDashboardRequest(
      new Request('https://example.com/dashboard/deal-finder/scan/ebay', {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { dealFinderStore: memoryDealFinderStore() }
    )
    expect(unknown).toBeNull()
  })

  it('keeps both marketplaces when their scans run side by side', async () => {
    const login = await handleDashboardRequest(
      new Request('https://example.com/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
      }),
      env
    )
    const token = cookieFrom(login!)
    const store = memoryDealFinderStore()
    // Both marketplaces have something remembered; an empty feed prunes a source's own
    // entries and must leave the other's alone.
    const entry = (id: string) => ({
      id,
      ask: 10,
      shipping: null,
      identifiedAt: new Date().toISOString(),
      identity: null,
      label: null,
      query: null,
      googleUrl: null,
      cardmarketUrl: null,
      pricedAt: null,
      floor: null,
      comps: [],
      problem: null
    })
    await store.putCache({ version: CACHE_VERSION, entries: { 'marktplaats:1': entry('marktplaats:1'), 'vinted:1': entry('vinted:1') } })

    // Marktplaats is held until Vinted has finished and been saved, so both scans have
    // read the store before either writes to it.
    let releaseMarktplaats = () => {}
    const marktplaatsGate = new Promise<void>((resolve) => {
      releaseMarktplaats = resolve
    })
    const fetchCardmarketPage = async (url: string) => {
      if (url.includes('marktplaats.nl')) {
        await marktplaatsGate
        return '{"listings":[],"facets":[],"totalResultCount":0}'
      }
      return '<html></html>'
    }
    const scan = (source: string) =>
      handleDashboardRequest(
        new Request(`https://example.com/dashboard/deal-finder/scan/${source}`, {
          method: 'POST',
          headers: { Cookie: `${SESSION_COOKIE}=${token}` }
        }),
        env,
        seededRuntime({ dealFinderStore: store, fetchCardmarketPage })
      )

    const marktplaats = scan('marktplaats')
    const vinted = await scan('vinted')
    expect(vinted?.status).toBe(200)
    const afterVinted = (await vinted!.json()) as { report: { sources: Array<{ source: string }> } }
    expect(afterVinted.report.sources.map((source) => source.source)).toEqual(['vinted'])

    releaseMarktplaats()
    const response = await marktplaats
    expect(response?.status).toBe(200)
    const { report } = (await response!.json()) as { report: { sources: Array<{ source: string }> } }
    expect(report.sources.map((source) => source.source)).toEqual(['marktplaats', 'vinted'])

    const stored = await store.getReport()
    expect(stored?.sources.map((source) => source.source)).toEqual(['marktplaats', 'vinted'])
    // Each scan pruned its own marketplace; neither put the other's stale entry back.
    await expect(store.getCache()).resolves.toEqual({ version: CACHE_VERSION, entries: {} })
  })
})
