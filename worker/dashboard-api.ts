import type { CardmarketReport, FetchCardmarketPage } from '../app/services/cardmarket/scan'
import { runCardmarketScan, withProductFrontImages } from '../app/services/cardmarket/scan'
import type { MarktplaatsDealsReport } from '../app/services/marktplaats-deals/scan'
import { runMarktplaatsDealsScan } from '../app/services/marktplaats-deals/scan'
import { listLedgerInventory, type CmsDb } from './cms/db'
import { json, normalizeApiPath } from './cms/http'
import { ensureSeeded } from './cms/seed'
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
  DB?: CmsDb
  MEDIA?: import('./cms/media').MediaBucket
  CARDMARKET?: {
    get(key: string): Promise<string | null>
    put(key: string, value: string): Promise<void>
  }
}

export type CardmarketStore = {
  getReport(): Promise<CardmarketReport | null>
  putReport(report: CardmarketReport): Promise<void>
}

export type MarktplaatsDealsStore = {
  getReport(): Promise<MarktplaatsDealsReport | null>
  putReport(report: MarktplaatsDealsReport): Promise<void>
}

export type DashboardRuntime = {
  fetchCardmarketPage?: FetchCardmarketPage
  scanBrowserError?: string
  cardmarketStore?: CardmarketStore
  marktplaatsDealsStore?: MarktplaatsDealsStore
  db?: CmsDb
  media?: import('./cms/media').MediaBucket
  mediaCache?: import('./cms/media').MediaCache
  ctx?: { waitUntil(promise: Promise<unknown>): void }
  purgeMediaCache?: (pathname: string) => Promise<void>
}

const MAX_BODY_BYTES = 4096
const API_PATHS = new Set([
  '/dashboard/session',
  '/dashboard/logout',
  '/dashboard/ledger',
  '/dashboard/cardmarket/report',
  '/dashboard/cardmarket/scan',
  '/dashboard/marktplaats-deals/report',
  '/dashboard/marktplaats-deals/scan',
  '/api/admin/session',
  '/api/admin/logout',
  '/api/admin/ledger',
  '/api/admin/cardmarket/report',
  '/api/admin/cardmarket/scan',
  '/api/admin/marktplaats-deals/report',
  '/api/admin/marktplaats-deals/scan'
])
const CARDMARKET_REPORT_KEY = 'report'
const MARKTPLAATS_DEALS_REPORT_KEY = 'marktplaats-deals'

export function memoryCardmarketStore(): CardmarketStore {
  let report: CardmarketReport | null = null
  return {
    async getReport() {
      return report
    },
    async putReport(next) {
      report = next
    }
  }
}

export function kvCardmarketStore(kv: NonNullable<DashboardEnv['CARDMARKET']>): CardmarketStore {
  return {
    async getReport() {
      const raw = await kv.get(CARDMARKET_REPORT_KEY)
      return raw ? (JSON.parse(raw) as CardmarketReport) : null
    },
    async putReport(report) {
      await kv.put(CARDMARKET_REPORT_KEY, JSON.stringify(report))
    }
  }
}

export function memoryMarktplaatsDealsStore(): MarktplaatsDealsStore {
  let report: MarktplaatsDealsReport | null = null
  return {
    async getReport() {
      return report
    },
    async putReport(next) {
      report = next
    }
  }
}

export function kvMarktplaatsDealsStore(kv: NonNullable<DashboardEnv['CARDMARKET']>): MarktplaatsDealsStore {
  return {
    async getReport() {
      const raw = await kv.get(MARKTPLAATS_DEALS_REPORT_KEY)
      return raw ? (JSON.parse(raw) as MarktplaatsDealsReport) : null
    },
    async putReport(report) {
      await kv.put(MARKTPLAATS_DEALS_REPORT_KEY, JSON.stringify(report))
    }
  }
}

export function normalizeDashboardPath(pathname: string): string {
  return normalizeApiPath(pathname)
}

export function isDashboardApiPath(pathname: string): boolean {
  return API_PATHS.has(normalizeDashboardPath(pathname))
}

export function isDashboardPath(pathname: string): boolean {
  const path = normalizeDashboardPath(pathname)
  return path === '/dashboard' || path.startsWith('/dashboard/')
}

function configured(env: DashboardEnv): env is DashboardEnv & {
  DASHBOARD_USERNAME: string
  DASHBOARD_PASSWORD: string
  DASHBOARD_SESSION_SECRET: string
} {
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

type AuthEnv = DashboardEnv & {
  DASHBOARD_USERNAME: string
  DASHBOARD_PASSWORD: string
  DASHBOARD_SESSION_SECRET: string
}

async function login(request: Request, env: AuthEnv): Promise<Response> {
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
        Location: '/',
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
        Location: '/',
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    })
  }

  return json({ ok: true }, 200, { 'Set-Cookie': cookie })
}

async function inventoryFor(env: DashboardEnv, runtime?: DashboardRuntime) {
  const db = runtime?.db ?? env.DB
  if (!db) {
    return []
  }
  await ensureSeeded(db)
  return listLedgerInventory(db)
}

export async function requireAdminSession(request: Request, env: DashboardEnv): Promise<Response | null> {
  if (!configured(env)) {
    return json({ error: 'Sign in is not available.' }, 503)
  }

  const token = readCookie(request.headers.get('Cookie'), SESSION_COOKIE)
  if (!token) {
    return json({ error: 'Sign in required' }, 401)
  }

  const user = await verifySessionToken(env.DASHBOARD_SESSION_SECRET, token)
  if (!user) {
    return json({ error: 'Sign in required' }, 401, { 'Set-Cookie': clearSessionCookie(isSecureRequest(request)) })
  }

  return null
}

async function ledger(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  return json(buildLedger(await inventoryFor(env, runtime)))
}

let fallbackStore: CardmarketStore | undefined
let fallbackDealsStore: MarktplaatsDealsStore | undefined

function resolveStore(env: DashboardEnv, runtime?: DashboardRuntime): CardmarketStore {
  if (runtime?.cardmarketStore) {
    return runtime.cardmarketStore
  }
  if (env.CARDMARKET) {
    return kvCardmarketStore(env.CARDMARKET)
  }
  fallbackStore ??= memoryCardmarketStore()
  return fallbackStore
}

function resolveDealsStore(env: DashboardEnv, runtime?: DashboardRuntime): MarktplaatsDealsStore {
  if (runtime?.marktplaatsDealsStore) {
    return runtime.marktplaatsDealsStore
  }
  if (env.CARDMARKET) {
    return kvMarktplaatsDealsStore(env.CARDMARKET)
  }
  fallbackDealsStore ??= memoryMarktplaatsDealsStore()
  return fallbackDealsStore
}

async function cardmarketReport(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  const products = await inventoryFor(env, runtime)
  const report = await resolveStore(env, runtime).getReport()
  return json({ report: report ? withProductFrontImages(report, products) : null })
}

async function cardmarketScan(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  if (!runtime?.fetchCardmarketPage) {
    return json({ error: runtime?.scanBrowserError ?? 'Cardmarket scan is only available locally.' }, 404)
  }

  const store = resolveStore(env, runtime)
  const fetchPage = runtime.fetchCardmarketPage
  const previous = await store.getReport()
  try {
    const report = await runCardmarketScan({
      products: await inventoryFor(env, runtime),
      previous,
      fetchPage
    })
    await store.putReport(report)
    return json({ report })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Cardmarket scan failed.' }, 500)
  }
}

async function marktplaatsDealsReport(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  const report = await resolveDealsStore(env, runtime).getReport()
  return json({ report })
}

async function marktplaatsDealsScan(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  if (!runtime?.fetchCardmarketPage) {
    return json({ error: runtime?.scanBrowserError ?? 'Marktplaats deals scan is only available locally.' }, 404)
  }

  const store = resolveDealsStore(env, runtime)
  try {
    const report = await runMarktplaatsDealsScan({ fetchPage: runtime.fetchCardmarketPage })
    await store.putReport(report)
    return json({ report })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Marktplaats deals scan failed.' }, 500)
  }
}

function routeKey(path: string): string {
  return path.replace(/^\/api\/admin\//, '/dashboard/')
}

export async function handleDashboardRequest(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response | null> {
  const path = normalizeDashboardPath(new URL(request.url).pathname)
  if (!API_PATHS.has(path)) {
    return null
  }

  if (!configured(env)) {
    return unconfigured()
  }

  const key = routeKey(path)

  if (key === '/dashboard/session' && request.method === 'POST') {
    return login(request, env)
  }

  if (key === '/dashboard/logout' && request.method === 'POST') {
    return logout(request)
  }

  if (key === '/dashboard/ledger' && request.method === 'GET') {
    return ledger(request, env, runtime)
  }

  if (key === '/dashboard/cardmarket/report' && request.method === 'GET') {
    return cardmarketReport(request, env, runtime)
  }

  if (key === '/dashboard/cardmarket/scan' && request.method === 'POST') {
    return cardmarketScan(request, env, runtime)
  }

  if (key === '/dashboard/marktplaats-deals/report' && request.method === 'GET') {
    return marktplaatsDealsReport(request, env, runtime)
  }

  if (key === '/dashboard/marktplaats-deals/scan' && request.method === 'POST') {
    return marktplaatsDealsScan(request, env, runtime)
  }

  return json({ error: 'Method not allowed' }, 405)
}
