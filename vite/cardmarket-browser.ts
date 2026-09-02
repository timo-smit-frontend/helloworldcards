import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { CardmarketReport, FetchCardmarketPage, FetchCardmarketPageOptions } from '../app/services/cardmarket/scan'
import type { MarktplaatsDealsReport } from '../app/services/marktplaats-deals/scan'
import type { CardmarketStore, MarktplaatsDealsStore } from '../worker/dashboard-api'

const execFileAsync = promisify(execFile)
const REPORT_FILE = path.join('.cache', 'cardmarket-report.json')
const DEALS_REPORT_FILE = path.join('.cache', 'marktplaats-deals-report.json')
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

export function fileMarktplaatsDealsStore(root: string): MarktplaatsDealsStore {
  const filePath = path.join(root, DEALS_REPORT_FILE)

  return {
    async getReport() {
      if (!fs.existsSync(filePath)) {
        return null
      }
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as MarktplaatsDealsReport
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

async function ensureScanChrome(root: string): Promise<void> {
  if (await isCdpReady()) {
    return
  }

  const executable = chromeExecutable()
  if (!executable) {
    throw new Error('Google Chrome is not installed.')
  }

  const userDataDir = path.join(root, BROWSER_PROFILE)
  fs.mkdirSync(userDataDir, { recursive: true })
  spawnScanChrome(executable, cdpPort(), userDataDir)

  const ready = await waitFor(() => isCdpReady(), 20_000)
  if (!ready) {
    throw new Error('Could not start the Cardmarket Chrome window.')
  }
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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await waitForBotChallengeClear(page, new URL(url).hostname)

      if (url.includes('cardmarket.com')) {
        await page.waitForSelector('[id^="articleRow"]', { timeout: 25_000 }).catch(() => undefined)
        await loadMoreCardmarketArticles(page, options)
      }
      return await page.content()
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

async function loadMoreCardmarketArticles(page: Page, options?: FetchCardmarketPageOptions): Promise<void> {
  const maxLoadMore = options?.maxLoadMore ?? 0
  if (maxLoadMore <= 0) {
    return
  }

  for (let i = 0; i < maxLoadMore; i++) {
    let html = await page.content()
    if (pageLooksChallenged(await page.title().catch(() => ''), html)) {
      const cleared = await waitForBotChallengeClear(page, 'Cardmarket load more')
      if (!cleared) {
        return
      }
      html = await page.content()
    }
    if (options?.stopWhen?.(html)) {
      return
    }

    const button = page.locator('#loadMoreButton')
    if ((await button.count()) === 0 || !(await button.isVisible().catch(() => false))) {
      return
    }

    const rowsBefore = await page.locator('[id^="articleRow"]').count()
    await button.click().catch(() => undefined)

    const grew = await page
      .waitForFunction(
        (before) => document.querySelectorAll('[id^="articleRow"]').length > before,
        rowsBefore,
        { timeout: 8_000 }
      )
      .then(() => true)
      .catch(() => false)

    const afterHtml = await page.content()
    if (pageLooksChallenged(await page.title().catch(() => ''), afterHtml)) {
      await waitForBotChallengeClear(page, 'Cardmarket load more')
      // Don't keep hammering Load more after a challenge — use whatever rows we already have.
      return
    }

    // Button spun / no new rows: stop instead of clicking up to 10× and hammering Cloudflare.
    if (!grew) {
      return
    }
  }
}
