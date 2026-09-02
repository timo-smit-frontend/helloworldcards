import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { seedMediaFiles } from '../app/cms/seed-media'
import { handleAdminRequest } from '../worker/cms/admin-api'
import { handleMediaPublic, memoryR2, type MediaBucket } from '../worker/cms/media'
import { handleLlms, handlePublicApi, handleSitemap } from '../worker/cms/public-api'
import { handleDashboardRequest, type DashboardRuntime } from '../worker/dashboard-api'
import { createMemoryD1, ensureCmsSchema } from '../test/helpers/memory-d1'
import { closePlaywrightCardmarketFetcher, fileCardmarketStore, fileMarktplaatsDealsStore, getPlaywrightCardmarketFetcher } from './cardmarket-browser'
import { seedMediaWithVariants } from './media-variants'
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

export function loadDashboardEnv(root = process.cwd()): {
  DASHBOARD_USERNAME?: string
  DASHBOARD_PASSWORD?: string
  DASHBOARD_SESSION_SECRET?: string
} {
  const filePath = path.join(root, '.dev.vars')
  const fromFile = fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath, 'utf8')) : {}

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
    pathname.startsWith('/dashboard/marktplaats-deals') ||
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

function seedLocalMediaVariantsInBackground(media: MediaBucket, root = process.cwd()): void {
  void seedMediaWithVariants(media, path.join(root, 'seed/media'), seedMediaFiles).catch((error) => {
    console.error('[cms-api] Failed to seed media variants:', error)
  })
}

type ViteCmsRuntime = DashboardRuntime & { dispose?: () => Promise<void> }

async function createViteCmsRuntime(): Promise<ViteCmsRuntime> {
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
      seedLocalMediaVariantsInBackground(env.MEDIA)
      return {
        db: env.DB,
        media: env.MEDIA,
        dispose: () => proxy.dispose()
      }
    }
    await proxy.dispose()
  } catch {
    // Fall back to in-memory D1/R2 so `npm run dev` still works without Wrangler.
  }

  const media = memoryR2()
  await seedLocalMediaBucket(media)
  seedLocalMediaVariantsInBackground(media)
  return {
    db: createMemoryD1(),
    media
  }
}

let runtimePromise: Promise<ViteCmsRuntime> | null = null

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
      const runtime: DashboardRuntime = {
        db: cms.db,
        media: cms.media,
        cardmarketStore: fileCardmarketStore(root),
        marktplaatsDealsStore: fileMarktplaatsDealsStore(root)
      }

      let browser: Awaited<ReturnType<typeof getPlaywrightCardmarketFetcher>> | null = null
      let scanBrowserError: string | undefined
      const needsBrowser =
        (url === '/dashboard/cardmarket/scan' || url === '/api/admin/cardmarket/scan' ||
          url === '/dashboard/marktplaats-deals/scan' || url === '/api/admin/marktplaats-deals/scan') &&
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
          ...(browser ? { fetchCardmarketPage: browser.fetchPage } : {}),
          ...(scanBrowserError ? { scanBrowserError } : {})
        }

        const response =
          (await handleAdminRequest(request, env, withBrowser)) ??
          (await handleDashboardRequest(request, env, withBrowser)) ??
          (await handlePublicApi(request, env, withBrowser)) ??
          (await handleMediaPublic(request, env, withBrowser)) ??
          (await handleSitemap(request, env, withBrowser)) ??
          (await handleLlms(request, env, withBrowser))

        if (!response) {
          next()
          return
        }

        await sendFetchResponse(response, res)
      } finally {
        if (browser) {
          await closePlaywrightCardmarketFetcher()
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
    },
    configurePreviewServer(server) {
      server.middlewares.use(cmsApiMiddleware(server.config.root))
    },
    async closeBundle() {
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
