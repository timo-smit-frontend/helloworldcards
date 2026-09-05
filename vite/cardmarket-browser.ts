import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { CardmarketReport, FetchCardmarketPage, FetchCardmarketPageOptions } from '../app/services/cardmarket/scan'
import { CardmarketBlockedError } from '../app/services/deal-finder/cardmarket'
import type { DealFinderCache } from '../app/services/deal-finder/cache'
import type { DealFinderReport } from '../app/services/deal-finder/types'
import type { CardmarketStore, DealFinderStore } from '../worker/dashboard-api'

const execFileAsync = promisify(execFile)
const REPORT_FILE = path.join('.cache', 'cardmarket-report.json')
const DEALS_REPORT_FILE = path.join('.cache', 'deal-finder-report.json')
const DEALS_CACHE_FILE = path.join('.cache', 'deal-finder-cache.json')
const BROWSER_PROFILE = path.join('.cache', 'cardmarket-chrome')
const CDP_URL = process.env.CARDMARKET_CDP_URL ?? 'http://127.0.0.1:9333'

export type CardmarketFetcher = {
  fetchPage: FetchCardmarketPage
  close: () => Promise<void>
}

export type ChromeAction = 'connect' | 'launch'

let shared: CardmarketFetcher | null = null

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

export function resetPlaywrightCardmarketFetcher() {
  shared = null
}

export async function closePlaywrightCardmarketFetcher() {
  const current = shared
  shared = null
  await current?.close()
}

export async function getPlaywrightCardmarketFetcher(
  root = process.cwd(),
  create: (root: string) => Promise<CardmarketFetcher> = createPlaywrightCardmarketFetcher
): Promise<CardmarketFetcher> {
  if (!shared) {
    shared = await create(root)
  }
  return shared
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

export function chromeExecutable(): string | undefined {
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
async function waitForBotChallengeClear(page: Page, label: string, timeoutMs = 180_000): Promise<boolean> {
  const title = await page.title().catch(() => '')
  const html = await page.content().catch(() => '')
  if (!pageLooksChallenged(title, html)) {
    return true
  }

  console.info(`[cardmarket-browser] Bot check on ${label} — complete it in the Chrome window`)
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

async function warmup(page: Page) {
  await page.goto('https://www.cardmarket.com/en/Pokemon', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForBotChallengeClear(page, 'Cardmarket warmup', 45_000)
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

export async function createPlaywrightCardmarketFetcher(root = process.cwd()): Promise<CardmarketFetcher> {
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

  const page = context.pages()[0] ?? (await context.newPage())
  await warmup(page)

  return {
    async fetchPage(url: string, options?: FetchCardmarketPageOptions) {
      return await fetchWithBotChecks(page, url, options)
    },
    async close() {
      if (mode === 'persistent') {
        await context.close().catch(() => undefined)
        return
      }
      await page.close().catch(() => undefined)
      await browser?.close().catch(() => undefined)
    }
  }
}

/**
 * Cardmarket's bot check does not only fire on a reload: clicking "Show more" can
 * drop the page into a spinner that never resolves. The only way out is to reload
 * the page and let the user tick "I am not a bot" again — so that is exactly what
 * this does, and it then re-expands the offers from the top so the card still gets
 * checked instead of being silently skipped.
 */
const CARDMARKET_ATTEMPTS = 3

async function fetchWithBotChecks(page: Page, url: string, options?: FetchCardmarketPageOptions): Promise<string> {
  const host = new URL(url).hostname
  const isOffers = url.includes('cardmarket.com')

  // Vinted redirects the automated Chrome profile into a /session-refresh page that
  // never resolves, so the scan only ever saw the interstitial. The same pages come
  // back in full for a plain HTTP request, which is what we use instead.
  if (isVintedHost(host)) {
    return await fetchVintedPage(url)
  }

  for (let attempt = 1; attempt <= CARDMARKET_ATTEMPTS; attempt += 1) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const cleared = await waitForBotChallengeClear(page, host)

    if (!isOffers) {
      return await page.content()
    }

    if (cleared) {
      await page.waitForSelector('[id^="articleRow"]', { timeout: 25_000 }).catch(() => undefined)
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

    if (attempt < CARDMARKET_ATTEMPTS) {
      console.info(`[cardmarket-browser] Reloading ${url} so the bot check can be cleared (attempt ${attempt + 1})`)
    }
  }

  throw new CardmarketBlockedError(`Cardmarket kept blocking ${url} after ${CARDMARKET_ATTEMPTS} attempts.`)
}

/**
 * Click "Show more" until the whole offer list is loaded, the caller has what it
 * needs, or the page stalls. Returns `stalled` when only a reload can recover.
 */
async function expandOffers(page: Page, options?: FetchCardmarketPageOptions): Promise<'complete' | 'stalled'> {
  const maxLoadMore = options?.maxLoadMore ?? 0
  if (maxLoadMore <= 0) {
    return 'complete'
  }

  for (let index = 0; index < maxLoadMore; index += 1) {
    const html = await page.content()
    if (pageLooksChallenged(await page.title().catch(() => ''), html)) {
      return 'stalled'
    }
    if (options?.stopWhen?.(html)) {
      return 'complete'
    }

    const button = page.locator('#loadMoreButton')
    if ((await button.count()) === 0 || !(await button.isVisible().catch(() => false))) {
      // No button left — this is the bottom of the list.
      return 'complete'
    }

    const rowsBefore = await page.locator('[id^="articleRow"]').count()
    await button.click().catch(() => undefined)

    const grew = await page
      .waitForFunction((before) => document.querySelectorAll('[id^="articleRow"]').length > before, rowsBefore, {
        timeout: 15_000
      })
      .then(() => true)
      .catch(() => false)

    if (pageLooksChallenged(await page.title().catch(() => ''), await page.content())) {
      return 'stalled'
    }

    // The button spun without adding rows — the infinite-load state.
    if (!grew) {
      return 'stalled'
    }
  }

  return 'complete'
}
