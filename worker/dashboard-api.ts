import { buildLedger } from './ledger'
import {
  clearSessionCookie,
  createSessionToken,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
  timingSafeEqual,
  verifySessionToken
} from './session'

export type DashboardEnv = {
  DASHBOARD_USERNAME?: string
  DASHBOARD_PASSWORD?: string
  DASHBOARD_SESSION_SECRET?: string
}

const MAX_BODY_BYTES = 4096
const API_PATHS = new Set(['/dashboard/session', '/dashboard/logout', '/dashboard/ledger'])

export function normalizeDashboardPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }

  return pathname
}

export function isDashboardApiPath(pathname: string): boolean {
  return API_PATHS.has(normalizeDashboardPath(pathname))
}

export function isDashboardPath(pathname: string): boolean {
  const path = normalizeDashboardPath(pathname)
  return path === '/dashboard' || path.startsWith('/dashboard/')
}

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...headers
    }
  })
}

function configured(env: DashboardEnv): env is Required<DashboardEnv> {
  return Boolean(env.DASHBOARD_USERNAME && env.DASHBOARD_PASSWORD && env.DASHBOARD_SESSION_SECRET)
}

function unconfigured(): Response {
  return json({ error: 'Sign in is not available.' }, 503)
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:'
}

async function readCredentials(request: Request): Promise<{ username: string; password: string } | null> {
  const contentType = request.headers.get('content-type') ?? ''
  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > MAX_BODY_BYTES) {
    return null
  }

  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as { username?: unknown; password?: unknown }
      if (typeof body.username !== 'string' || typeof body.password !== 'string') {
        return null
      }
      return { username: body.username, password: body.password }
    } catch {
      return null
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(await request.text())
    const username = params.get('username')
    const password = params.get('password')
    if (username == null || password == null) {
      return null
    }
    return { username, password }
  }

  return null
}

async function login(request: Request, env: Required<DashboardEnv>): Promise<Response> {
  const credentials = await readCredentials(request)
  if (!credentials) {
    return json({ error: 'Wrong username or password' }, 401)
  }

  const userOk = timingSafeEqual(credentials.username, env.DASHBOARD_USERNAME)
  const passwordOk = timingSafeEqual(credentials.password, env.DASHBOARD_PASSWORD)
  if (!userOk || !passwordOk) {
    return json({ error: 'Wrong username or password' }, 401)
  }

  const token = await createSessionToken(env.DASHBOARD_SESSION_SECRET, env.DASHBOARD_USERNAME)
  const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html')
  const cookie = sessionCookie(token, isSecureRequest(request))

  if (wantsHtml) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/dashboard/',
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    })
  }

  return json({ ok: true }, 200, { 'Set-Cookie': cookie })
}

function logout(request: Request): Response {
  const cookie = clearSessionCookie(isSecureRequest(request))
  const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html')

  if (wantsHtml) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/dashboard/',
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    })
  }

  return json({ ok: true }, 200, { 'Set-Cookie': cookie })
}

async function ledger(request: Request, env: Required<DashboardEnv>): Promise<Response> {
  const token = readCookie(request.headers.get('Cookie'), SESSION_COOKIE)
  if (!token) {
    return json({ error: 'Sign in required' }, 401)
  }

  const user = await verifySessionToken(env.DASHBOARD_SESSION_SECRET, token)
  if (!user) {
    return json({ error: 'Sign in required' }, 401, { 'Set-Cookie': clearSessionCookie(isSecureRequest(request)) })
  }

  return json(buildLedger())
}

export async function handleDashboardRequest(request: Request, env: DashboardEnv): Promise<Response | null> {
  const path = normalizeDashboardPath(new URL(request.url).pathname)
  if (!API_PATHS.has(path)) {
    return null
  }

  if (!configured(env)) {
    return unconfigured()
  }

  if (path === '/dashboard/session' && request.method === 'POST') {
    return login(request, env)
  }

  if (path === '/dashboard/logout' && request.method === 'POST') {
    return logout(request)
  }

  if (path === '/dashboard/ledger' && request.method === 'GET') {
    return ledger(request, env)
  }

  return json({ error: 'Method not allowed' }, 405)
}
