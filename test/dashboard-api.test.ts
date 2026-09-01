import { describe, expect, it } from 'vitest'
import { handleDashboardRequest, memoryCardmarketStore } from '../worker/dashboard-api'
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
              <span>PSA 10</span>
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
    expect(urls.every((url) => url.includes('minCondition=2'))).toBe(true)

    const body = (await scan!.json()) as {
      report: { products: Array<{ title: string; image: string | null; suggestion: { direction: string; target: number } | null }> }
    }
    const pokeKid = body.report.products.find((product) => product.title === 'Poke Kid')
    expect(pokeKid?.image).toBe('/media/80573086_front.jpg')
    expect(pokeKid?.suggestion).toEqual(expect.objectContaining({ direction: 'up', target: 100 }))
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
})
