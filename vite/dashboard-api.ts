import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { seedMediaFiles } from '../app/cms/seed-media'
import { handleAdminRequest } from '../worker/cms/admin-api'
import { autoSyncEnabled, createCmsAutoSync, type CmsAutoSync } from './cms-auto-sync'
import { handleMediaPublic, memoryR2, type MediaBucket } from '../worker/cms/media'
import { handleLlms, handlePublicApi, handleSitemap } from '../worker/cms/public-api'
import type { DashboardRuntime } from '../worker/dashboard-api'
import { createMemoryD1, ensureCmsSchema } from '../test/helpers/memory-d1'
import {
  closePlaywrightCardmarketFetcher,
  fileCardmarketStore,
  fileDealFinderStore,
  getPlaywrightCardmarketFetcher
} from './cardmarket-browser'
import { psaCertLookup } from '../app/services/deal-finder/psa-cert'
import { closeSlabReader, createSlabReader } from './deal-finder-ocr'
import { seedMediaWithVariants, type SeedSignal } from './media-variants'
import { stripProductCosts } from './strip-product-costs'

function parseDotEnv(source: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

/**
 * `.dev.vars`, re-read only when the file changes. Every request to the dev CMS used to
 * read and parse it twice.
 */
const devVars = new Map<string, { mtimeMs: number; values: Record<string, string> }>()

function readDevVars(root: string): Record<string, string> {
  const filePath = path.join(root, '.dev.vars')
  let mtimeMs: number
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs
  } catch {
    devVars.delete(filePath)
    return {}
  }
  const cached = devVars.get(filePath)
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.values
  }
  const values = parseDotEnv(fs.readFileSync(filePath, 'utf8'))
  devVars.set(filePath, { mtimeMs, values })
  return values
}

/**
 * Keys the deal finder needs, read from `.dev.vars` like the dashboard login.
 * The label reader runs locally and needs nothing; PSA_API_TOKEN is optional too,
 * and without it the scan trusts the label it read off the photos.
 */
export function loadScanSecrets(root = process.cwd()): { PSA_API_TOKEN?: string } {
  const fromFile = readDevVars(root)

  return {
    PSA_API_TOKEN: process.env.PSA_API_TOKEN ?? fromFile.PSA_API_TOKEN
  }
}

export function loadDashboardEnv(root = process.cwd()): {
  DASHBOARD_USERNAME?: string
  DASHBOARD_PASSWORD?: string
  DASHBOARD_SESSION_SECRET?: string
} {
  const fromFile = readDevVars(root)

  return {
    DASHBOARD_USERNAME: process.env.DASHBOARD_USERNAME ?? fromFile.DASHBOARD_USERNAME,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD ?? fromFile.DASHBOARD_PASSWORD,
    DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET ?? fromFile.DASHBOARD_SESSION_SECRET
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') {
    return undefined
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks)
}

async function toFetchRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const headers = new Headers()

  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null) {
      continue
    }
    headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }

  const body = await readBody(req)
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers
  }

  if (body && body.length > 0) {
    init.body = new Uint8Array(body)
    init.duplex = 'half'
  }

  return new Request(url, init)
}

async function sendFetchResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status

  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies)
  }

  response.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') {
      return
    }
    res.setHeader(name, value)
  })

  res.end(Buffer.from(await response.arrayBuffer()))
}

function isCmsDevPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/dashboard/session') ||
    pathname.startsWith('/dashboard/logout') ||
    pathname.startsWith('/dashboard/ledger') ||
    pathname.startsWith('/dashboard/cardmarket') ||
    pathname.startsWith('/dashboard/deal-finder') ||
    pathname === '/api/public' ||
    pathname.startsWith('/media/') ||
    pathname === '/sitemap.xml' ||
    pathname === '/llms.txt' ||
    pathname === '/llms-full.txt'
  )
}

async function seedLocalMediaBucket(media: MediaBucket, root = process.cwd()): Promise<void> {
  await seedMediaWithVariants(media, path.join(root, 'seed/media'), seedMediaFiles, { variants: false })
}

/**
 * Encoding every variant takes longer than a `vite-node` script or a restarted dev server
 * lives, so the runtime's signal stops the loop on dispose instead of letting it write to
 * a bucket stub Miniflare has already poisoned.
 */
function seedLocalMediaVariantsInBackground(media: MediaBucket, signal: SeedSignal, root = process.cwd()): void {
  void seedMediaWithVariants(media, path.join(root, 'seed/media'), seedMediaFiles, { signal }).catch((error) => {
    if (signal.aborted) {
      return
    }
    console.error('[cms-api] Failed to seed media variants:', error)
  })
}

/** `persistent` marks the real Wrangler-backed state; the in-memory fallback is a fresh
 * seed every time and must never be published over production. */
type ViteCmsRuntime = DashboardRuntime & { dispose?: () => Promise<void>; persistent: boolean }

async function createViteCmsRuntime(): Promise<ViteCmsRuntime> {
  const signal = { aborted: false }
  const stopAndDispose = async (dispose: () => Promise<unknown>) => {
    signal.aborted = true
    await dispose()
  }

  try {
    const { getPlatformProxy } = await import('wrangler')
    const proxy = await Promise.race([
      getPlatformProxy({ persist: true }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('getPlatformProxy timed out')), 8000)
      })
    ])
    const env = proxy.env as {
      DB?: import('../worker/cms/db').CmsDb & { exec?(query: string): Promise<unknown> }
      MEDIA?: import('../worker/cms/media').MediaBucket
    }
    if (env.DB && env.MEDIA) {
      await ensureCmsSchema(env.DB)
      await seedLocalMediaBucket(env.MEDIA)
      seedLocalMediaVariantsInBackground(env.MEDIA, signal)
      return {
        db: env.DB,
        media: env.MEDIA,
        persistent: true,
        dispose: () => stopAndDispose(() => proxy.dispose())
      }
    }
    await stopAndDispose(() => proxy.dispose())
  } catch {
    // Fall back to in-memory D1/R2 so `npm run dev` still works without Wrangler.
  }

  const media = memoryR2()
  await seedLocalMediaBucket(media)
  seedLocalMediaVariantsInBackground(media, signal)
  return {
    db: createMemoryD1(),
    media,
    persistent: false
  }
}

let runtimePromise: Promise<ViteCmsRuntime> | null = null
let autoSyncPromise: Promise<CmsAutoSync | null> | null = null

/**
 * Keeping the two environments in step is part of running the CMS, not a command to
 * remember, so the dev server reconciles at startup and publishes every admin change.
 */
function cmsAutoSync(root: string): Promise<CmsAutoSync | null> {
  autoSyncPromise ??= (async () => {
    if (!autoSyncEnabled()) {
      return null
    }
    const cms = await viteCmsRuntime()
    if (!cms.persistent || !cms.db || !cms.media) {
      console.warn('[cms-sync] no local Wrangler state, so nothing is synced with production')
      return null
    }
    const sync = createCmsAutoSync({ root, db: cms.db, media: cms.media })
    sync.start()
    return sync
  })()
  return autoSyncPromise
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Admin routes that keep their own files and never touch the CMS database or bucket. */
const NON_CMS_ADMIN = ['/api/admin/cardmarket', '/api/admin/deal-finder']

function changesCms(url: string, method: string, status: number): boolean {
  return (
    url.startsWith('/api/admin/') &&
    !READ_ONLY_METHODS.has(method) &&
    status < 400 &&
    !NON_CMS_ADMIN.some((prefix) => url.startsWith(prefix))
  )
}

function viteCmsRuntime(): Promise<ViteCmsRuntime> {
  runtimePromise ??= createViteCmsRuntime()
  return runtimePromise
}

function cmsApiMiddleware(root: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    try {
      const url = req.url?.split('?')[0] ?? ''
      if (!isCmsDevPath(url)) {
        next()
        return
      }

      const request = await toFetchRequest(req)
      const cms = await viteCmsRuntime()
      const secrets = loadScanSecrets(root)
      const runtime: DashboardRuntime = {
        db: cms.db,
        media: cms.media,
        cardmarketStore: fileCardmarketStore(root),
        dealFinderStore: fileDealFinderStore(root),
        readSlabs: createSlabReader({ root }),
        ...(secrets.PSA_API_TOKEN ? { lookupCert: psaCertLookup({ token: secrets.PSA_API_TOKEN }) } : {})
      }

      let browser: Awaited<ReturnType<typeof getPlaywrightCardmarketFetcher>> | null = null
      let scanBrowserError: string | undefined
      // The deal finder scan is one route per marketplace as well as a combined one,
      // and every one of them drives the Chrome window.
      const needsBrowser =
        (url === '/dashboard/cardmarket/scan' ||
          url === '/api/admin/cardmarket/scan' ||
          url.startsWith('/dashboard/deal-finder/scan') ||
          url.startsWith('/api/admin/deal-finder/scan')) &&
        req.method === 'POST'
      if (needsBrowser) {
        try {
          browser = await getPlaywrightCardmarketFetcher(root)
        } catch (error) {
          browser = null
          scanBrowserError = error instanceof Error ? error.message : 'Could not start Chrome for scanning.'
          console.error('[dashboard-api]', scanBrowserError)
        }
      }

      try {
        const env = loadDashboardEnv(root)
        const withBrowser = {
          ...runtime,
          ...(browser
            ? { fetchCardmarketPage: browser.fetchPage, resolveUrl: browser.resolveUrl, sellerReviews: browser.sellerReviews }
            : {}),
          ...(scanBrowserError ? { scanBrowserError } : {})
        }

        const response =
          (await handleAdminRequest(request, env, withBrowser)) ??
          (await handlePublicApi(request, env, withBrowser)) ??
          (await handleMediaPublic(request, env, withBrowser)) ??
          (await handleSitemap(request, env, withBrowser)) ??
          (await handleLlms(request, env, withBrowser))

        if (!response) {
          next()
          return
        }

        await sendFetchResponse(response, res)
        if (changesCms(url, req.method ?? 'GET', response.status)) {
          void cmsAutoSync(root).then((sync) => sync?.noteWrite())
        }
      } finally {
        if (browser) {
          await closePlaywrightCardmarketFetcher()
          await closeSlabReader()
        }
      }
    } catch (error) {
      next(error)
    }
  }
}

export function dashboardApiPlugin(): Plugin {
  return {
    name: 'cms-api',
    configureServer(server) {
      server.middlewares.use(cmsApiMiddleware(server.config.root))
      // `vite-node` boots a Vite server of its own to transform modules, and the sync
      // runs through `vite-node`: starting the sync there would have it spawn itself.
      if (!server.config.server.middlewareMode) {
        void cmsAutoSync(server.config.root)
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use(cmsApiMiddleware(server.config.root))
    },
    async closeBundle() {
      // Disposing the platform proxy poisons every stub the sync is holding, so let the
      // task that is already running finish first — bounded, since a remote round trip
      // must not hold up the process.
      const stopping = (await autoSyncPromise)?.stop()
      if (stopping) {
        await Promise.race([stopping, new Promise((resolve) => setTimeout(resolve, 2000).unref())])
      }
      const runtime = await runtimePromise
      await runtime?.dispose?.()
    }
  }
}

export function stripProductCostsPlugin(): Plugin {
  return {
    name: 'strip-product-costs',
    enforce: 'pre',
    transform(code, id, options) {
      if (options?.ssr || process.env.VITEST) {
        return
      }

      if (!id.replace(/\\/g, '/').endsWith('/app/database/products.ts')) {
        return
      }

      return {
        code: stripProductCosts(code),
        map: null
      }
    }
  }
}
