import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { CardmarketReport, FetchCardmarketPage, FetchCardmarketPageOptions } from '../app/services/cardmarket/scan'
import { CardmarketBlockedError } from '../app/services/deal-finder/cardmarket'
import {
  isMarktplaatsChallenge,
  isMarktplaatsSearchApi,
  marktplaatsSellerProfileUrl,
  parseSellerReviews
} from '../app/services/deal-finder/marktplaats'
import type { DealFinderCache } from '../app/services/deal-finder/cache'
import type { ResolveUrl, SellerReviews } from '../app/services/deal-finder/scan'
import type { DealFinderReport } from '../app/services/deal-finder/types'
import type { CardmarketStore, DealFinderStore } from '../worker/dashboard-api'

const execFileAsync = promisify(execFile)
const REPORT_FILE = path.join('.cache', 'cardmarket-report.json')
const DEALS_REPORT_FILE = path.join('.cache', 'deal-finder-report.json')
const DEALS_CACHE_FILE = path.join('.cache', 'deal-finder-cache.json')
const BROWSER_PROFILE = path.join('.cache', 'cardmarket-chrome')
const CDP_URL = process.env.CARDMARKET_CDP_URL ?? 'http://127.0.0.1:9333'

/** One scan's tab: everything it loads goes through this page, and nothing else does. */
export type CardmarketFetcher = {
  fetchPage: FetchCardmarketPage
  resolveUrl: ResolveUrl
  sellerReviews: SellerReviews
  close: () => Promise<void>
}

/**
 * The Chrome window every scan shares, handing each scan a tab of its own.
 *
 * Marktplaats and Vinted are scanned side by side. Sharing one tab between them
 * queued every Google and Cardmarket load of one scan behind the other's, so the
 * second scan mostly sat waiting; on a tab each, both get on with it. The window is
 * still one window: the Cardmarket session and a cleared bot check are the profile's,
 * so a check ticked in either tab holds for both.
 */
export type ScanBrowser = {
  openTab: () => Promise<CardmarketFetcher>
  /** A bare tab in the same window, for work that drives pages itself. */
  openPage: () => Promise<Page>
  /** False once the window is gone — closed by hand, or Chrome quit — and nothing in it can be used. */
  isOpen: () => boolean
  close: () => Promise<void>
}

type ChromeAction = 'connect' | 'launch'

/**
 * The one Chrome window, held as the promise of it rather than the window itself.
 * The two scans arrive together: memoising only the finished launch let both see
 * nothing there and both start Chrome on the same profile, which the second cannot.
 */
let shared: Promise<ScanBrowser> | null = null

export function fileCardmarketStore(root: string): CardmarketStore {
  const filePath = path.join(root, REPORT_FILE)

  return {
    async getReport() {
      if (!fs.existsSync(filePath)) {
        return null
      }
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as CardmarketReport
      } catch {
        return null
      }
    },
    async putReport(report) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, JSON.stringify(report))
    }
  }
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value))
}

export function fileDealFinderStore(root: string): DealFinderStore {
  const reportPath = path.join(root, DEALS_REPORT_FILE)
  const cachePath = path.join(root, DEALS_CACHE_FILE)

  return {
    async getReport() {
      return readJson<DealFinderReport>(reportPath)
    },
    async putReport(report) {
      writeJson(reportPath, report)
    },
    async getCache() {
      return readJson<DealFinderCache>(cachePath)
    },
    async putCache(cache) {
      writeJson(cachePath, cache)
    }
  }
}

/**
 * Until when the window is to be left alone once the work in it is done.
 *
 * A relist that finds Vinted logged out can only be finished by someone logging in
 * in this window — and there is nobody to do that if the window closes the moment the
 * request answers. The pin holds the window open long enough for that; the next
 * piece of work to finish after it has lapsed closes the window as usual.
 */
let pinnedUntil = 0

export function keepScanBrowserOpen(ms: number) {
  pinnedUntil = Math.max(pinnedUntil, Date.now() + ms)
}

export function isScanBrowserPinned(): boolean {
  return Date.now() < pinnedUntil
}

/** How much longer the window is held open, in ms; 0 when it is not. */
export function scanBrowserPinnedForMs(): number {
  return Math.max(0, pinnedUntil - Date.now())
}

export function resetScanBrowser() {
  shared = null
  pinnedUntil = 0
}

export async function closeScanBrowser() {
  if (Date.now() < pinnedUntil) {
    return
  }
  const current = shared
  shared = null
  const browser = await current?.catch(() => null)
  await browser?.close()
}

export async function getScanBrowser(
  root = process.cwd(),
  create: (root: string) => Promise<ScanBrowser> = createScanBrowser
): Promise<ScanBrowser> {
  // A window closed by hand — which a stuck Vinted session asks for — leaves the
  // memoised browser pointing at nothing; every tab opened on it would fail. It is
  // forgotten here, so the next piece of work starts a window of its own.
  if (shared) {
    const current = await shared.catch(() => null)
    if (current && !current.isOpen()) {
      shared = null
    }
  }
  if (!shared) {
    const launching = create(root)
    shared = launching
    // A launch that failed is not kept: the next scan gets to try again.
    launching.catch(() => {
      if (shared === launching) {
        shared = null
      }
    })
  }
  return await shared
}

export function chromeLaunchArgs(port: number, userDataDir: string): string[] {
  return [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled'
  ]
}

export function nextChromeAction(status: { cdpReady: boolean; chromeRunning?: boolean }): ChromeAction {
  return status.cdpReady ? 'connect' : 'launch'
}

function chromeExecutable(): string | undefined {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
  ].find((candidate) => fs.existsSync(candidate))
}

function cdpPort(url = CDP_URL): number {
  const port = Number(new URL(url).port)
  return Number.isFinite(port) && port > 0 ? port : 9333
}

async function isCdpReady(url = CDP_URL): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/json/version`)
    return response.ok
  } catch {
    return false
  }
}

async function waitFor(predicate: () => Promise<boolean>, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

function spawnScanChrome(executable: string, port: number, userDataDir: string) {
  const child = spawn(executable, chromeLaunchArgs(port, userDataDir), { detached: true, stdio: 'ignore' })
  child.unref()
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

export function isVintedHost(host: string): boolean {
  return /(?:^|\.)vinted\.[a-z.]+$/i.test(host)
}

/**
 * Marktplaats' search endpoint answers JSON, and driving it through the browser would
 * hand back Chrome's JSON viewer with the payload HTML-escaped inside it. A plain
 * request returns the JSON itself, which is what the overview parser wants.
 */
async function fetchMarktplaatsSearch(url: string, request: typeof fetch = fetch): Promise<string> {
  const response = await request(url, {
    headers: {
      'user-agent': BROWSER_USER_AGENT,
      accept: 'application/json, text/plain, */*',
      'accept-language': 'nl-NL,nl;q=0.9,en;q=0.8'
    },
    redirect: 'follow'
  })
  if (!response.ok) {
    throw new Error(`Marktplaats returned ${response.status} for the search.`)
  }
  return await response.text()
}

/**
 * A Marktplaats listing page, over a plain request rather than the scan's Chrome tab.
 *
 * The detail page is only read for its photos, its full description and its postage,
 * none of which needs a rendered page — and every listing page driven through the one
 * shared tab is a page load the Cardmarket work behind it has to queue up for. The
 * browser is still there to fall back on if a plain request comes back short.
 */
async function fetchMarktplaatsListing(url: string, request: typeof fetch = fetch): Promise<string> {
  const response = await request(url, {
    headers: {
      'user-agent': BROWSER_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'nl-NL,nl;q=0.9,en;q=0.8'
    },
    redirect: 'follow'
  })
  if (!response.ok) {
    throw new Error(`Marktplaats returned ${response.status} for ${url}.`)
  }
  return await response.text()
}

function isMarktplaatsListing(url: string): boolean {
  return /(?:^|\.)marktplaats\.nl$/i.test(new URL(url).hostname) && url.includes('/v/')
}

/**
 * A Marktplaats seller's review count. Its own JSON endpoint answers this keyed on the
 * `sellerId` the search feed already carries, so no listing page has to be opened to
 * find out whether a seller is worth buying from.
 */
const marktplaatsSellerReviews: SellerReviews = async (sellerId, request: typeof fetch = fetch) => {
  const response = await request(marktplaatsSellerProfileUrl(sellerId), {
    headers: { 'user-agent': BROWSER_USER_AGENT, accept: 'application/json', 'accept-language': 'nl-NL,nl;q=0.9' }
  })
  return response.ok ? parseSellerReviews(await response.text()) : null
}

export async function fetchVintedPage(url: string, request: typeof fetch = fetch): Promise<string> {
  const response = await request(url, {
    headers: {
      'user-agent': BROWSER_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'nl-NL,nl;q=0.9,en;q=0.8'
    },
    redirect: 'follow'
  })
  if (!response.ok) {
    throw new Error(`Vinted returned ${response.status} for ${url}.`)
  }
  return await response.text()
}

const BOT_CHALLENGE =
  /attention required|even geduld|just a moment|sorry, you have been blocked|i.?m not a (?:robot|bot)|unusual traffic|are you a robot|cf-browser-verification|checking your browser|beveiliging wordt geverifieerd/i

function pageLooksChallenged(title: string, html: string): boolean {
  return BOT_CHALLENGE.test(title) || BOT_CHALLENGE.test(html.slice(0, 8_000))
}

/** Pause the scan while the user completes a Cloudflare / Google bot check in Chrome. */
export async function waitForBotChallengeClear(page: Page, label: string, timeoutMs = BOT_CHECK_WAIT_MS): Promise<boolean> {
  const title = await page.title().catch(() => '')
  const html = await page.content().catch(() => '')
  if (!pageLooksChallenged(title, html)) {
    return true
  }

  console.info(`[cardmarket-browser] Bot check on ${label}, complete it in the Chrome window`)
  const cleared = await page
    .waitForFunction(
      () => {
        const t = document.title
        const snippet = `${t}\n${document.body?.innerText?.slice(0, 2_000) ?? ''}`
        return !/attention required|even geduld|just a moment|sorry, you have been blocked|i.?m not a (?:robot|bot)|unusual traffic|are you a robot|checking your browser|beveiliging wordt geverifieerd/i.test(
          snippet
        )
      },
      undefined,
      { timeout: timeoutMs }
    )
    .then(() => true)
    .catch(() => false)

  if (!cleared) {
    console.info(`[cardmarket-browser] Bot check still open after waiting (${label})`)
  }
  return cleared
}

/**
 * Land on Cardmarket's Pokémon page once, to pick up the session every offers page
 * after it needs.
 *
 * This is only ever done on demand. Marktplaats and Vinted are read over plain HTTP and
 * Google is read in the tab, so a sync can walk a whole marketplace — and answer from
 * cached prices — without a Cardmarket page being wanted at all. Opening one up front
 * spent a bot check on nobody's behalf.
 */
async function warmup(page: Page) {
  await page.goto('https://www.cardmarket.com/en/Pokemon', { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS })
  await waitForBotChallengeClear(page, 'Cardmarket warmup')
}

async function killCdpPort(port: number): Promise<void> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `:${port}`])
    for (const pid of stdout.trim().split('\n').filter(Boolean)) {
      process.kill(Number(pid), 'SIGTERM')
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  } catch {
    // Nothing listening on the port.
  }
}

async function connectCdpContext(chromium: typeof import('playwright').chromium): Promise<{ context: BrowserContext; browser: Browser }> {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  if (!context) {
    throw new Error('No Chrome window to attach to.')
  }
  return { context, browser }
}

/** Holds a piece of work until the scan's Chrome tab is free, and keeps it to itself. */
type TabLock = <T>(run: () => Promise<T>) => Promise<T>

/**
 * Serialise everything that drives one scan's Chrome tab.
 *
 * A scan reads listing pages while it is working its way through Google and
 * Cardmarket. Those listing pages are plain requests and never come near the tab — but
 * a Marktplaats page that comes back blocked falls back to it, and two navigations at
 * once on one tab would leave both callers reading whichever page won. Every use of
 * the tab goes through here, so that cannot happen.
 */
function createLock(): TabLock {
  let tail: Promise<unknown> = Promise.resolve()

  return <T>(run: () => Promise<T>): Promise<T> => {
    const next = tail.then(run, run)
    tail = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }
}

async function createScanBrowser(root = process.cwd()): Promise<ScanBrowser> {
  const { chromium } = await import('playwright')
  const userDataDir = path.join(root, BROWSER_PROFILE)
  fs.mkdirSync(userDataDir, { recursive: true })
  const port = cdpPort()

  let context: BrowserContext | undefined
  let browser: Browser | null = null
  let mode: 'cdp' | 'persistent' = 'cdp'

  if (await isCdpReady()) {
    try {
      ;({ context, browser } = await connectCdpContext(chromium))
    } catch {
      await killCdpPort(port)
    }
  }

  if (!context) {
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chrome',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
        viewport: null
      })
      mode = 'persistent'
    } catch {
      const executable = chromeExecutable()
      if (!executable) {
        throw new Error('Google Chrome is not installed.')
      }
      await killCdpPort(port)
      spawnScanChrome(executable, port, userDataDir)
      const ready = await waitFor(() => isCdpReady(), 20_000)
      if (!ready) {
        throw new Error('Could not start the scan Chrome window. Close any open Cardmarket Chrome window and try again.')
      }
      ;({ context, browser } = await connectCdpContext(chromium))
      mode = 'cdp'
    }
  }

  // A fresh window comes with a blank tab; the first scan takes that one rather than
  // leaving it sitting there, and every scan after it opens its own.
  const spare = context.pages()

  let open = true
  context.on('close', () => {
    open = false
  })
  browser?.on('disconnected', () => {
    open = false
  })

  return {
    isOpen() {
      return open && (browser ? browser.isConnected() : true)
    },
    async openTab() {
      const page = spare.shift() ?? (await context.newPage())
      const withTab = createLock()

      // Warmed up at most once per tab, and only if a Cardmarket page is actually asked
      // for. A failed warmup is not fatal — the page that wanted it deals with its own
      // bot check.
      let warmed: Promise<void> | null = null
      const ensureWarm = () => (warmed ??= warmup(page).catch(() => undefined))

      return {
        sellerReviews: marktplaatsSellerReviews,
        async fetchPage(url: string, options?: FetchCardmarketPageOptions) {
          return await fetchWithBotChecks(page, url, options, withTab, ensureWarm)
        },
        async resolveUrl(url: string) {
          return await followRedirect(page, url, withTab)
        },
        async close() {
          await page.close().catch(() => undefined)
        }
      }
    },
    async openPage() {
      return spare.shift() ?? (await context.newPage())
    },
    async close() {
      if (mode === 'persistent') {
        await context.close().catch(() => undefined)
        return
      }
      await Promise.all(context.pages().map((page) => page.close().catch(() => undefined)))
      await browser?.close().catch(() => undefined)
    }
  }
}

/**
 * Where a Google result redirect leads, asked over HTTP rather than by going there.
 *
 * Google hands back a `Location` header for these, and the header is the whole answer —
 * driving the shared Chrome tab to the destination costs a full page load, and a card
 * can need three of them before a Cardmarket page scores. The request goes through the
 * browser's own context, so it carries the same cookies the search page was served
 * with; anything else (an interstitial, a redirect Google only performs in script)
 * comes back as null and is followed in the tab instead.
 */
const MAX_REDIRECT_HOPS = 5

async function resolveOverHttp(context: BrowserContext, url: string): Promise<string | null> {
  let current = url

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    let location: string | undefined
    try {
      const response = await context.request.get(current, {
        maxRedirects: 0,
        failOnStatusCode: false,
        timeout: 20_000,
        headers: { referer: 'https://www.google.com/', 'user-agent': BROWSER_USER_AGENT }
      })
      const redirected = response.status() >= 300 && response.status() < 400
      location = redirected ? response.headers()['location'] : undefined
      await response.dispose()
    } catch {
      return null
    }

    if (!location) {
      // Not a redirect at all — whatever Google answered with needs a real page.
      return null
    }

    current = new URL(location, current).href
    if (!current.includes('/goto?url=')) {
      return current
    }
  }

  return null
}

/**
 * Follow a redirect and report where it landed.
 *
 * Google stopped printing result URLs: every organic result is now an opaque
 * `/goto?url=` link, so the only way to learn which Cardmarket page a result points at
 * is to ask where it goes. Landing on Cardmarket's bot check is not a failure and is
 * never skipped past — it is waited out so it can be cleared in the Chrome window,
 * which both keeps that click from being wasted and leaves the session that every
 * Cardmarket request after it needs.
 */
async function followRedirect(page: Page, url: string, withTab: TabLock): Promise<string | null> {
  const overHttp = await resolveOverHttp(page.context(), url)
  if (overHttp) {
    return overHttp
  }

  return await withTab(async () => {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS })
    } catch {
      // A redirect that will not load is not worth a long wait: there is another
      // candidate result behind this one, and it is quicker to go and ask that.
      return null
    }

    await waitForBotChallengeClear(page, new URL(page.url()).hostname)

    const landed = page.url()
    return landed && !landed.includes('/goto?url=') ? landed : null
  })
}

/**
 * Cardmarket's bot check does not only fire on a reload: clicking "Show more" can
 * drop the page into a spinner that never resolves. The only way out is to reload
 * the page and let the user tick "I am not a bot" again — so that is exactly what
 * this does, and it then re-expands the offers from the top so the card still gets
 * checked instead of being silently skipped.
 */
const CARDMARKET_ATTEMPTS = 3

/**
 * How long each step of a page load is given before the page is reloaded.
 *
 * Every one of these waits ends in the same thing — reload and go again — so none of
 * them is worth sitting through for long. A Cardmarket page that has dropped into a
 * spinner does not come out of it, and a bot check nobody is in front of does not clear
 * itself either: what gets a scan moving again is a fresh page with a fresh checkbox on
 * it. Three quick attempts put more of those in front of you than one long wait does.
 */
const LOAD_TIMEOUT_MS = 25_000
const BOT_CHECK_WAIT_MS = 45_000
const ROWS_WAIT_MS = 10_000
const EXPAND_WAIT_MS = 8_000

async function fetchWithBotChecks(
  page: Page,
  url: string,
  options: FetchCardmarketPageOptions | undefined,
  withTab: TabLock,
  ensureWarm: () => Promise<void>
): Promise<string> {
  const host = new URL(url).hostname
  const isOffers = url.includes('cardmarket.com')

  // Vinted redirects the automated Chrome profile into a /session-refresh page that
  // never resolves, so the scan only ever saw the interstitial. The same pages come
  // back in full for a plain HTTP request, which is what we use instead.
  if (isVintedHost(host)) {
    return await fetchVintedPage(url)
  }

  if (isMarktplaatsSearchApi(url)) {
    return await fetchMarktplaatsSearch(url)
  }

  // A listing page is read for its photos, its description and its postage, none of
  // which needs rendering — and keeping it out of the shared tab leaves that tab for
  // the Google and Cardmarket loads that genuinely do. A plain request that comes back
  // blocked or broken falls through to the browser, which is what used to do this.
  if (isMarktplaatsListing(url)) {
    try {
      const html = await fetchMarktplaatsListing(url)
      if (!isMarktplaatsChallenge(html)) {
        return html
      }
    } catch {
      // Falls through to the browser below.
    }
  }

  return await withTab(async () => {
    // Only a Cardmarket page needs a Cardmarket session, and only the first one needs it
    // established — a sync that never gets as far as pricing never pays for one.
    if (isOffers) {
      await ensureWarm()
    }

    let stopped = 'kept blocking'

    for (let attempt = 1; attempt <= CARDMARKET_ATTEMPTS; attempt += 1) {
      // A load that never finishes used to fail the listing outright after a minute of
      // waiting. It is the same problem a reload fixes, so it is retried like one.
      const loaded = await page
        .goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false)

      // What the message at the end says should be the last thing that happened here.
      stopped = loaded ? 'kept blocking' : 'would not load'

      if (loaded) {
        const cleared = await waitForBotChallengeClear(page, host)

        if (!isOffers) {
          return await page.content()
        }

        if (cleared) {
          await page.waitForSelector('[id^="articleRow"]', { timeout: ROWS_WAIT_MS }).catch(() => undefined)
          const outcome = await expandOffers(page, options)
          if (outcome === 'complete') {
            return await page.content()
          }

          // Stalled part-way: if the rows we already have answer the question, take them.
          const html = await page.content()
          if (options?.stopWhen?.(html)) {
            return html
          }
        }
      }

      if (attempt < CARDMARKET_ATTEMPTS) {
        console.info(`[cardmarket-browser] Reloading ${url}, ${loaded ? 'still blocked' : 'it did not load'} (attempt ${attempt + 1})`)
      }
    }

    throw new CardmarketBlockedError(`${host} ${stopped} ${url} after ${CARDMARKET_ATTEMPTS} attempts.`)
  })
}

/**
 * What one look at the offers page tells us, in a single round trip.
 *
 * The loop below used to ask Chrome for the entire document twice per click and parse
 * all of it again each time, which on a fully expanded product page is megabytes over
 * the debugging socket for the sake of a handful of new rows. Only the rows that were
 * not there last time come back now, along with just enough of the page to recognise a
 * bot check and to see whether there is still a button to press.
 */
type OffersState = {
  title: string
  snippet: string
  /** The rows added since the last look — all of them on the first look. */
  rows: string
  total: number
  hasMore: boolean
}

function offersState(page: Page, from: number): Promise<OffersState> {
  return page.evaluate((start) => {
    const rows = document.querySelectorAll('[id^="articleRow"]')
    const button = document.querySelector('#loadMoreButton') as HTMLElement | null
    return {
      title: document.title,
      // A bot check replaces the document and takes the offers with it, so while there
      // are still rows the title is the whole story — and reading the body text of a
      // fully expanded offers list thirty times over is not free either.
      snippet: rows.length > 0 ? '' : (document.body?.innerText?.slice(0, 4_000) ?? ''),
      rows: Array.from(rows)
        .slice(start)
        .map((row) => row.outerHTML)
        .join(''),
      total: rows.length,
      hasMore: button != null && (button.offsetWidth > 0 || button.offsetHeight > 0 || button.getClientRects().length > 0)
    }
  }, from)
}

/**
 * Click "Show more" until the whole offer list is loaded, the caller has what it
 * needs, or the page stalls. Returns `stalled` when only a reload can recover.
 *
 * `stopWhen` is asked about the new rows rather than the whole page each time. It only
 * ever answers "is there a comp in here", and once that is true the expansion is over,
 * so rows already judged never need judging again.
 */
async function expandOffers(page: Page, options?: FetchCardmarketPageOptions): Promise<'complete' | 'stalled'> {
  const maxLoadMore = options?.maxLoadMore ?? 0
  if (maxLoadMore <= 0) {
    return 'complete'
  }

  let read = 0

  for (let index = 0; index < maxLoadMore; index += 1) {
    const state = await offersState(page, read)
    read = state.total

    if (pageLooksChallenged(state.title, state.snippet)) {
      return 'stalled'
    }
    // With `loadAll` the caller wants every row, so having enough to answer is not a
    // reason to stop — only running out of "Show more" is.
    if (!options?.loadAll && options?.stopWhen?.(state.rows)) {
      return 'complete'
    }
    if (!state.hasMore) {
      // No button left — this is the bottom of the list.
      return 'complete'
    }

    await page
      .locator('#loadMoreButton')
      .click()
      .catch(() => undefined)

    const grew = await page
      .waitForFunction((before) => document.querySelectorAll('[id^="articleRow"]').length > before, read, {
        timeout: EXPAND_WAIT_MS
      })
      .then(() => true)
      .catch(() => false)

    // The button spun without adding rows — the infinite-load state, which is also how
    // a bot check served mid-expansion shows up, since it takes the rows away with it.
    if (!grew) {
      return 'stalled'
    }
  }

  return 'complete'
}
