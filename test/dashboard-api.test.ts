import { describe, expect, it } from 'vitest'
import {
  fetchCardmarketPageWithBrowser,
  handleDashboardRequest,
  memoryCardmarketStore
} from '../worker/dashboard-api'
import { SESSION_COOKIE } from '../worker/session'

const env = {
  DASHBOARD_USERNAME: 'sam',
  DASHBOARD_PASSWORD: 'correct-horse',
  DASHBOARD_SESSION_SECRET: 'session-secret-for-tests'
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
      env
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

    const signedOut = await handleDashboardRequest(new Request('https://example.com/dashboard/cardmarket/report'), env, {
      cardmarketStore: store
    })
    expect(signedOut?.status).toBe(401)

    const signedIn = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cardmarket/report', {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { cardmarketStore: store }
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

    const scan = await handleDashboardRequest(
      new Request('https://example.com/dashboard/cardmarket/scan', { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      {
        cardmarketStore: store,
        fetchCardmarketPage: async (url) => {
          urls.push(url)
          return `
            <div id="articleRow1" class="article-row">
              <a href="/en/Pokemon/Users/CatDoesThings">CatDoesThings</a>
              <span>PSA 10</span>
              <span>100,00 €</span>
            </div>
          `
        }
      }
    )

    expect(scan?.status).toBe(200)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((url) => url.includes('minCondition=2'))).toBe(true)

    const body = (await scan!.json()) as {
      report: { products: Array<{ title: string; image: string | null; suggestion: { direction: string; target: number } | null }> }
    }
    const pokeKid = body.report.products.find((product) => product.title === 'Poke Kid')
    expect(pokeKid?.image).toBe('/images/80573086_front.jpg')
    expect(pokeKid?.suggestion).toEqual(expect.objectContaining({ direction: 'up', target: 100 }))
  })

  it('renders Cardmarket pages with the browser binding so Cloudflare challenges can complete', async () => {
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
    const requested: Array<{ action: string; url: string; selector?: string }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('plain fetch should not be used on live Cardmarket scans')
    }) as typeof fetch

    try {
      const scan = await handleDashboardRequest(
        new Request('https://example.com/dashboard/cardmarket/scan', {
          method: 'POST',
          headers: { Cookie: `${SESSION_COOKIE}=${token}` }
        }),
        {
          ...env,
          BROWSER: {
            async quickAction(action: 'content', options: { url: string; waitForSelector?: { selector: string } }) {
              requested.push({ action, url: options.url, selector: options.waitForSelector?.selector })
              return Response.json({
                success: true,
                result: `
                  <div id="articleRow1" class="article-row">
                    <a href="/en/Pokemon/Users/CatDoesThings">CatDoesThings</a>
                    <span>PSA 10</span>
                    <span>100,00 €</span>
                  </div>
                `
              })
            }
          }
        },
        { cardmarketStore: store }
      )

      expect(scan?.status).toBe(200)
      expect(requested.length).toBeGreaterThan(0)
      expect(requested.every((item) => item.action === 'content')).toBe(true)
      expect(requested.every((item) => item.selector === '[id^="articleRow"]')).toBe(true)
      expect(requested.every((item) => item.url.includes('minCondition=2'))).toBe(true)

      const body = (await scan!.json()) as {
        report: { products: Array<{ title: string; error: string | null; suggestion: { target: number } | null }> }
      }
      const pokeKid = body.report.products.find((product) => product.title === 'Poke Kid')
      expect(pokeKid?.error).toBeNull()
      expect(pokeKid?.suggestion).toEqual(expect.objectContaining({ target: 100 }))
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('fetchCardmarketPageWithBrowser', () => {
  it('throws when Browser Run does not return HTML', async () => {
    await expect(
      fetchCardmarketPageWithBrowser(
        {
          async quickAction() {
            return Response.json({ success: false })
          }
        },
        'https://www.cardmarket.com/en/Pokemon/Products/Singles/Shiny-Star-V/Poke-Kid-s4a197'
      )
    ).rejects.toThrow(/no HTML/i)
  })
})
