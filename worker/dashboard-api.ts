import type { CmsSyncStatus } from '../app/cms/types'
import type { CardmarketReport, FetchCardmarketPage } from '../app/services/cardmarket/scan'
import { runCardmarketScan, withProductFrontImages, withWatchedProductsOnly } from '../app/services/cardmarket/scan'
import { mergeCaches } from '../app/services/deal-finder/cache'
import { DEAL_SOURCES } from '../app/services/deal-finder/constants'
import { isCurrentReport, mergeReports } from '../app/services/deal-finder/report'
import type {
  CertLookup,
  DealFinderCache,
  DealFinderReport,
  DealSource,
  Pacer,
  ResolveUrl,
  SellerReviews,
  SlabReader
} from '../app/services/deal-finder/scan'
import { runDealFinderScan } from '../app/services/deal-finder/scan'
import { VintedRelistError, vintedItemId, type VintedRelistOptions, type VintedRelistService } from '../app/services/vinted-relist'
import {
  batchAll,
  listAllProductRows,
  rowToInventory,
  rowToRecord,
  rowToSettings,
  SQL,
  updateProduct,
  type CmsDb,
  type ProductRow,
  type SettingsRow
} from './cms/db'
import { json, normalizeApiPath } from './cms/http'
import { ensureSeeded, needsSeeding } from './cms/seed'
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

export type CmsSync = {
  /** Bring the local database in line with production now; fails the way the sync did. */
  settle(): Promise<void>
  status(): CmsSyncStatus
}

export type DealFinderStore = {
  getReport(): Promise<DealFinderReport | null>
  putReport(report: DealFinderReport): Promise<void>
  /** What we already know about each listing, so a re-scan only does new work. */
  getCache(): Promise<DealFinderCache | null>
  putCache(cache: DealFinderCache): Promise<void>
}

export type DashboardRuntime = {
  fetchCardmarketPage?: FetchCardmarketPage
  scanBrowserError?: string
  cardmarketStore?: CardmarketStore
  dealFinderStore?: DealFinderStore
  /** Reads PSA labels off listing photos; without it the scan falls back to the listing text. */
  readSlabs?: SlabReader
  /** Resolves a certification number against PSA's own records. */
  lookupCert?: CertLookup
  /** Follows Google's result redirects to the page they point at. */
  resolveUrl?: ResolveUrl
  /** Looks up how many reviews a Marktplaats seller has. */
  sellerReviews?: SellerReviews
  /** Shared by every scan going at once, so together they still pace each site. */
  pacer?: Pacer
  /** Deletes and re-uploads Vinted listings through the local Chrome window. */
  vintedRelist?: VintedRelistService
  vintedRelistError?: string
  /**
   * The dev server's sync with production. Anything that acts on the inventory settles
   * through it first, so a local database that fell behind never drives a scan or a
   * relist; the admin shows its status.
   */
  cmsSync?: CmsSync
  db?: CmsDb
  media?: import('./cms/media').MediaBucket
  mediaCache?: import('./cms/media').MediaCache
  ctx?: { waitUntil(promise: Promise<unknown>): void }
  /** Drop these paths from the edge cache, all in one call. */
  purgeMediaCache?: (pathnames: string[]) => Promise<void>
}

const MAX_BODY_BYTES = 4096

/**
 * Marktplaats and Vinted each get their own scan route.
 *
 * A scan is a long, interruptible run that leans on a Chrome window and a bot check
 * somebody has to clear by hand, so being able to set one marketplace going without
 * the other — and to rerun the one that got blocked — is worth a route apiece. The
 * bare `/scan` still runs both.
 */
const DEAL_FINDER_SCAN_PATHS = DEAL_SOURCES.flatMap((source) => [
  `/dashboard/deal-finder/scan/${source}`,
  `/api/admin/deal-finder/scan/${source}`
])

const API_PATHS = new Set([
  ...DEAL_FINDER_SCAN_PATHS,
  '/dashboard/session',
  '/dashboard/logout',
  '/dashboard/ledger',
  '/dashboard/cardmarket/report',
  '/dashboard/cardmarket/scan',
  '/dashboard/cms-sync',
  '/dashboard/deal-finder/report',
  '/dashboard/deal-finder/scan',
  '/api/admin/session',
  '/api/admin/logout',
  '/api/admin/ledger',
  '/api/admin/cardmarket/report',
  '/api/admin/cardmarket/scan',
  '/api/admin/cms-sync',
  '/api/admin/deal-finder/report',
  '/api/admin/deal-finder/scan',
  '/dashboard/vinted-relist',
  '/api/admin/vinted-relist'
])

/** `/dashboard/vinted-relist/9878696344` — the listing to relist is in the path. */
const VINTED_RELIST_ITEM = /^\/(?:dashboard|api\/admin)\/vinted-relist\/(\d+)$/
const CARDMARKET_REPORT_KEY = 'report'
const DEAL_FINDER_REPORT_KEY = 'deal-finder'
const DEAL_FINDER_CACHE_KEY = 'deal-finder-cache'

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

function kvCardmarketStore(kv: NonNullable<DashboardEnv['CARDMARKET']>): CardmarketStore {
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

export function memoryDealFinderStore(): DealFinderStore {
  let report: DealFinderReport | null = null
  let cache: DealFinderCache | null = null
  return {
    async getReport() {
      return report
    },
    async putReport(next) {
      report = next
    },
    async getCache() {
      return cache
    },
    async putCache(next) {
      cache = next
    }
  }
}

function kvDealFinderStore(kv: NonNullable<DashboardEnv['CARDMARKET']>): DealFinderStore {
  return {
    async getReport() {
      const raw = await kv.get(DEAL_FINDER_REPORT_KEY)
      return raw ? (JSON.parse(raw) as DealFinderReport) : null
    },
    async putReport(report) {
      await kv.put(DEAL_FINDER_REPORT_KEY, JSON.stringify(report))
    },
    async getCache() {
      const raw = await kv.get(DEAL_FINDER_CACHE_KEY)
      return raw ? (JSON.parse(raw) as DealFinderCache) : null
    },
    async putCache(cache) {
      await kv.put(DEAL_FINDER_CACHE_KEY, JSON.stringify(cache))
    }
  }
}

function normalizeDashboardPath(pathname: string): string {
  return normalizeApiPath(pathname)
}

export function isDashboardApiPath(pathname: string): boolean {
  const path = normalizeDashboardPath(pathname)
  return API_PATHS.has(path) || VINTED_RELIST_ITEM.test(path)
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

/**
 * The ledger's inventory: every live product plus the sold ones that were trashed, which
 * stay on the books. The seed check rides on the settings row read in the same batch.
 */
async function inventoryFor(env: DashboardEnv, runtime?: DashboardRuntime) {
  const db = runtime?.db ?? env.DB
  if (!db) {
    return []
  }
  const read = () => batchAll(db, [db.prepare(SQL.settings), db.prepare(SQL.ledger)])
  let rows = await read()
  const settings = rowToSettings(rows[0].results[0] as SettingsRow | undefined)
  if (needsSeeding(settings)) {
    await ensureSeeded(db, settings)
    rows = await read()
  }
  return (rows[1].results as ProductRow[]).map(rowToInventory)
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
let fallbackDealsStore: DealFinderStore | undefined

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

function resolveDealsStore(env: DashboardEnv, runtime?: DashboardRuntime): DealFinderStore {
  if (runtime?.dealFinderStore) {
    return runtime.dealFinderStore
  }
  if (env.CARDMARKET) {
    return kvDealFinderStore(env.CARDMARKET)
  }
  fallbackDealsStore ??= memoryDealFinderStore()
  return fallbackDealsStore
}

/**
 * Settle the local database with production before acting on the inventory it holds.
 * Nothing to do on the live worker, which is production; in the dev server a failure
 * is a reason not to act rather than to act on stale rows.
 */
async function settleInventory(runtime?: DashboardRuntime): Promise<string | null> {
  if (!runtime?.cmsSync) {
    return null
  }
  try {
    await runtime.cmsSync.settle()
    return null
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return `The local database could not be brought in step with production, so nothing was done: ${reason}`
  }
}

async function cmsSyncStatus(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }
  return json({ sync: runtime?.cmsSync?.status() ?? null })
}

/** Settle now, and answer with the outcome either way so the admin can show it. */
async function cmsSyncSettle(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }
  if (!runtime?.cmsSync) {
    return json({ error: 'The sync with production only runs in the dev server.' }, 404)
  }
  const stale = await settleInventory(runtime)
  if (stale) {
    return json({ error: stale, sync: runtime.cmsSync.status() }, 503)
  }
  return json({ sync: runtime.cmsSync.status() })
}

async function cardmarketReport(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  const products = await inventoryFor(env, runtime)
  const report = await resolveStore(env, runtime).getReport()
  return json({ report: report ? withProductFrontImages(withWatchedProductsOnly(report, products), products) : null })
}

async function cardmarketScan(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  if (!runtime?.fetchCardmarketPage) {
    return json({ error: runtime?.scanBrowserError ?? 'Cardmarket scan is only available locally.' }, 404)
  }

  const stale = await settleInventory(runtime)
  if (stale) {
    return json({ error: stale }, 503)
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

async function dealFinderReport(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  const report = await resolveDealsStore(env, runtime).getReport()
  return json({ report: isCurrentReport(report) ? report : null })
}

/**
 * `/scan/vinted` walks Vinted alone, `/scan` walks both.
 *
 * What comes back is always the whole report: a run of one marketplace is folded into
 * what the other one last found, so the dashboard shows both lists however the scans
 * were started.
 */
function dealFinderSources(key: string): readonly DealSource[] | null {
  if (key === '/dashboard/deal-finder/scan') {
    return DEAL_SOURCES
  }
  const requested = key.slice('/dashboard/deal-finder/scan/'.length)
  return DEAL_SOURCES.includes(requested as DealSource) ? [requested as DealSource] : null
}

/**
 * Fold a finished scan into the stored report and cache.
 *
 * The two marketplaces are scanned side by side, each from its own button, and a scan
 * takes minutes — so what the store holds when a scan ends is not what it held when
 * the scan began: the other marketplace may have finished in between. Reading the
 * store only now, and letting one scan at a time do it, keeps the run that finishes
 * second from writing over the one that finished first.
 */
let committing: Promise<unknown> = Promise.resolve()

function commitScan(
  store: DealFinderStore,
  report: DealFinderReport,
  cache: DealFinderCache,
  sources: readonly DealSource[]
): Promise<DealFinderReport> {
  const commit = committing.then(async () => {
    const merged = mergeReports(await store.getReport(), report)
    await store.putReport(merged)
    await store.putCache(mergeCaches(await store.getCache(), cache, sources))
    return merged
  })
  // A commit that failed still has to hand the turn on.
  committing = commit.then(
    () => undefined,
    () => undefined
  )
  return commit
}

async function dealFinderScan(
  request: Request,
  env: DashboardEnv,
  sources: readonly DealSource[],
  runtime?: DashboardRuntime
): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }

  if (!runtime?.fetchCardmarketPage) {
    return json({ error: runtime?.scanBrowserError ?? 'The deal finder only runs locally.' }, 404)
  }

  const store = resolveDealsStore(env, runtime)
  try {
    const { report, cache } = await runDealFinderScan({
      fetchPage: runtime.fetchCardmarketPage,
      readSlabs: runtime.readSlabs,
      lookupCert: runtime.lookupCert,
      resolveUrl: runtime.resolveUrl,
      sellerReviews: runtime.sellerReviews,
      pace: runtime.pacer,
      cache: await store.getCache(),
      ownListings: await inventoryFor(env, runtime),
      sources
    })
    return json({ report: await commitScan(store, report, cache, sources) })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'The deal finder scan failed.' }, 500)
  }
}

function relistUnavailable(runtime?: DashboardRuntime): Response {
  return json({ error: runtime?.vintedRelistError ?? 'Vinted relisting only runs locally.' }, 404)
}

function relistFailure(error: unknown): Response {
  if (error instanceof VintedRelistError) {
    return json({ error: error.message }, error.status)
  }
  return json({ error: error instanceof Error ? error.message : 'The Vinted relist failed.' }, 500)
}

async function vintedRelistReport(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }
  if (!runtime?.vintedRelist) {
    return relistUnavailable(runtime)
  }
  try {
    const report = await runtime.vintedRelist.report(await inventoryFor(env, runtime))
    // A relist the seller finished by hand still has its product on the old listing.
    const db = runtime.db ?? env.DB
    for (const done of report.byHand) {
      if (done.productId != null && db) {
        await moveProductVintedUrl(db, done.productId, done.url)
      }
    }
    return json({ report })
  } catch (error) {
    return relistFailure(error)
  }
}

/**
 * Point the product at the listing that replaced its old one.
 *
 * The shop's "View on Vinted" link and the next relist both go by `vintedUrl`, so a
 * relist is not finished until the product says the new id.
 */
async function moveProductVintedUrl(db: CmsDb, productId: number, url: string): Promise<void> {
  const row = (await listAllProductRows(db)).find((candidate) => candidate.id === productId && candidate.deleted_at == null)
  if (!row) {
    return
  }
  await updateProduct(db, productId, { ...rowToRecord(row), vintedUrl: url, slug: row.slug })
}

/** An optional `{ "price": 59.99 }` body puts a new price on the copy instead of the old one. */
async function relistOptions(request: Request): Promise<VintedRelistOptions | Response> {
  const raw = await request.text()
  if (!raw.trim()) {
    return {}
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'The relist body must be JSON.' }, 400)
  }
  const price = (body as { price?: unknown })?.price
  if (price === undefined) {
    return {}
  }
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return json({ error: 'The relist price must be a positive number of euros.' }, 400)
  }
  return { price: Math.round(price * 100) / 100 }
}

/**
 * Delete a listing and put it up again, then answer with the wardrobe as it is now.
 *
 * The whole run — snapshot, delete, upload, product update — is one request, because
 * the Chrome tab it drives is opened for the request and closed after it.
 */
async function vintedRelist(request: Request, env: DashboardEnv, itemId: string, runtime?: DashboardRuntime): Promise<Response> {
  const unauthorized = await requireAdminSession(request, env)
  if (unauthorized) {
    return unauthorized
  }
  if (!runtime?.vintedRelist) {
    return relistUnavailable(runtime)
  }

  const options = await relistOptions(request)
  if (options instanceof Response) {
    return options
  }
  // The reserved check below is only as good as the local rows are current.
  const stale = await settleInventory(runtime)
  if (stale) {
    return json({ error: stale }, 503)
  }
  const products = await inventoryFor(env, runtime)
  // The relist screen no longer shows a reserved card, but a tab opened before it was
  // reserved still has the button: a sold card must not go back up as a fresh listing.
  const reserved = products.find((product) => product.reserved && vintedItemId(product.vintedUrl ?? '') === itemId)
  if (reserved) {
    return json({ error: `${reserved.title} is reserved. A sold card is not relisted.` }, 409)
  }
  try {
    const relisted = await runtime.vintedRelist.relist(itemId, products, options)
    const db = runtime.db ?? env.DB
    if (relisted.productId != null && db) {
      await moveProductVintedUrl(db, relisted.productId, relisted.url)
    }
    const report = await runtime.vintedRelist.report(await inventoryFor(env, runtime))
    return json({ relisted, report })
  } catch (error) {
    return relistFailure(error)
  }
}

function routeKey(path: string): string {
  return path.replace(/^\/api\/admin\//, '/dashboard/')
}

export async function handleDashboardRequest(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response | null> {
  const path = normalizeDashboardPath(new URL(request.url).pathname)
  const relistItem = path.match(VINTED_RELIST_ITEM)?.[1]
  if (!API_PATHS.has(path) && !relistItem) {
    return null
  }

  if (!configured(env)) {
    return unconfigured()
  }

  const key = routeKey(path)

  if (relistItem && request.method === 'POST') {
    return vintedRelist(request, env, relistItem, runtime)
  }

  if (key === '/dashboard/vinted-relist' && request.method === 'GET') {
    return vintedRelistReport(request, env, runtime)
  }

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

  if (key === '/dashboard/cms-sync' && request.method === 'GET') {
    return cmsSyncStatus(request, env, runtime)
  }

  if (key === '/dashboard/cms-sync' && request.method === 'POST') {
    return cmsSyncSettle(request, env, runtime)
  }

  if (key === '/dashboard/deal-finder/report' && request.method === 'GET') {
    return dealFinderReport(request, env, runtime)
  }

  if (key.startsWith('/dashboard/deal-finder/scan') && request.method === 'POST') {
    const sources = dealFinderSources(key)
    return sources ? dealFinderScan(request, env, sources, runtime) : json({ error: 'Unknown deal finder source.' }, 404)
  }

  return json({ error: 'Method not allowed' }, 405)
}
