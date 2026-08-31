import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Page } from 'playwright'
import type { CardmarketReport } from '../app/services/cardmarket/scan'
import type { CardmarketStore } from '../worker/dashboard-api'

const execFileAsync = promisify(execFile)
const REPORT_FILE = path.join('.cache', 'cardmarket-report.json')
const BROWSER_PROFILE = path.join('.cache', 'cardmarket-chrome')
const CDP_URL = process.env.CARDMARKET_CDP_URL ?? 'http://127.0.0.1:9333'

export type CardmarketFetcher = {
  fetchPage: (url: string) => Promise<string>
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

async function warmup(page: Page) {
  await page.goto('https://www.cardmarket.com/en/Pokemon', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page
    .waitForFunction(
      `() => /Cardmarket/i.test(document.title) && !/attention required|even geduld|just a moment/i.test(document.title)`,
      undefined,
      { timeout: 45_000 }
    )
    .catch(() => undefined)
}

export async function createPlaywrightCardmarketFetcher(root = process.cwd()): Promise<CardmarketFetcher> {
  await ensureScanChrome(root)

  const { chromium } = await import('playwright')
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  if (!context) {
    throw new Error('No Chrome window to attach to.')
  }

  const page = await context.newPage()
  await warmup(page)

  return {
    async fetchPage(url: string) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForSelector('[id^="articleRow"]', { timeout: 25_000 }).catch(() => undefined)
      return await page.content()
    },
    async close() {
      await page.close().catch(() => undefined)
      await browser.close().catch(() => undefined)
      await execFileAsync('pkill', ['-f', path.join(root, BROWSER_PROFILE)]).catch(() => undefined)
    }
  }
}
