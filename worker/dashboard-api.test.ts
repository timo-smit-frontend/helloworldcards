import { describe, expect, it } from 'vitest'
import { handleDashboardRequest } from './dashboard-api'
import { SESSION_COOKIE } from './session'

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
    const body = (await ledger!.json()) as { spending: number; potentialGain: number }
    expect(body.spending).toBeGreaterThan(0)
    expect(typeof body.potentialGain).toBe('number')
  })

  it('hides the ledger from signed-out requests', async () => {
    const response = await handleDashboardRequest(new Request('https://example.com/dashboard/ledger'), env)
    expect(response?.status).toBe(401)
  })
})
