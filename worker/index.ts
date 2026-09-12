import { WorkerEntrypoint } from 'cloudflare:workers'
import { handleAdminRequest } from './cms/admin-api'
import { applyAdminRobots, injectCmsPayload } from './cms/html'
import { json } from './cms/http'
import { handleMediaPublic } from './cms/media'
import { handleLlms, handlePublicApi, handleSitemap } from './cms/public-api'
import { buildPublicPayload } from './cms/public'
import { isDashboardApiPath, isDashboardPath, type DashboardRuntime } from './dashboard-api'
import { APEX_HOST, isAdminHost, isLocalHost, publicDashboardRedirect } from './hosts'
import { isHtmlResponse, shouldServeSpaFallback } from './spa'

const FILE_EXTENSION = /\.[a-zA-Z0-9]{1,8}$/

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
}

const HTML_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://scripts.clarity.ms https://www.clarity.ms https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://raw.githubusercontent.com https://www.googletagmanager.com https://*.googletagmanager.com https://*.google-analytics.com https://*.clarity.ms https://c.bing.com",
    "font-src 'self'",
    "connect-src 'self' https://formsubmit.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com https://cloudflareinsights.com https://static.cloudflareinsights.com",
    'frame-src https://www.googletagmanager.com https://td.doubleclick.net',
    "worker-src 'self' blob:"
  ].join('; ')
}

function withSecurityHeaders(response: Response, options?: { noindex?: boolean }): Response {
  const headers = new Headers(response.headers)

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }

  if (isHtmlResponse(response)) {
    for (const [name, value] of Object.entries(HTML_SECURITY_HEADERS)) {
      headers.set(name, value)
    }
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  } else if (response.status >= 400) {
    headers.set('Cache-Control', 'no-store')
  }

  if (options?.noindex) {
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    headers.set('Cache-Control', 'no-store')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

function canonicalRequestUrl(request: Request): URL | null {
  const url = new URL(request.url)
  let changed = false

  if (url.protocol === 'http:' && !isLocalHost(url.hostname)) {
    url.protocol = 'https:'
    changed = true
  }

  if (url.hostname === `www.${APEX_HOST}`) {
    url.hostname = APEX_HOST
    changed = true
  }

  const skipSlash = url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')
  const canSlash =
    !skipSlash &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    url.pathname !== '/' &&
    !url.pathname.endsWith('/') &&
    !FILE_EXTENSION.test(url.pathname)

  if (canSlash) {
    url.pathname = `${url.pathname}/`
    changed = true
  }

  return changed ? url : null
}

function redirectPermanently(url: URL | string): Response {
  const href = typeof url === 'string' ? url : url.href
  return withSecurityHeaders(Response.redirect(href, 301))
}

function asPermanentRedirect(response: Response, request: Request, noindex = false): Response {
  if (response.status !== 307 && response.status !== 308) {
    return withSecurityHeaders(response, { noindex })
  }

  const location = response.headers.get('Location')
  if (!location) {
    return withSecurityHeaders(response)
  }

  return redirectPermanently(new URL(location, request.url))
}

/**
 * The app shell — the built `index.html` — read from the static assets once per isolate.
 * It only changes with a deploy, and a deploy starts fresh isolates, so every page after
 * the first is rendered without asking the asset store for the same file again.
 */
let shellPromise: Promise<string> | null = null

async function fetchShell(assets: Fetcher, origin: string): Promise<string> {
  // The root is served as the shell whatever the trailing-slash rule says about
  // `/index.html`; the file name is kept as a second try.
  for (const path of ['/', '/index.html']) {
    const response = await assets.fetch(new URL(path, origin))
    if (response.ok && isHtmlResponse(response)) {
      return response.text()
    }
    await response.body?.cancel()
  }
  throw new Error('The app shell is missing from the static assets.')
}

function appShell(assets: Fetcher, origin: string): Promise<string> {
  if (!shellPromise) {
    shellPromise = fetchShell(assets, origin).catch((error: unknown) => {
      shellPromise = null
      throw error
    })
  }
  return shellPromise
}

function htmlResponse(html: string, status: number, method: string): Response {
  return new Response(method === 'HEAD' ? null : html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}

/** Media responses are cached by the platform in front of this entrypoint. */
export class CachedMedia extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const response = await handleMediaPublic(request, this.env, { ctx: this.ctx })
    return response ?? json({ error: 'Not found' }, 404)
  }

  /** Drop a set of paths from the edge cache in one call; a failed purge is logged, since the objects behind it are already gone. */
  async purgePaths(pathnames: string[]): Promise<void> {
    if (pathnames.length === 0) {
      return
    }
    try {
      await this.ctx.cache?.purge({ pathPrefixes: pathnames })
    } catch (error) {
      console.error('media cache purge failed', error)
    }
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const redirectTo = canonicalRequestUrl(request)
    if (redirectTo) {
      return redirectPermanently(redirectTo)
    }

    const url = new URL(request.url)
    const hostRedirect = publicDashboardRedirect(url)
    if (hostRedirect) {
      return redirectPermanently(hostRedirect)
    }

    const { pathname } = url

    // Images are most of the traffic, so they are answered before anything else is looked at.
    if (pathname.startsWith('/media/')) {
      return withSecurityHeaders(await ctx.exports.CachedMedia.fetch(request))
    }

    // With read replication switched on for the database, a public read is answered by
    // the replica nearest the visitor; the admin stays on the primary so that it always
    // reads back what it just wrote. Without replication both go to the primary as before.
    const publicDb = env.DB?.withSession('first-unconstrained')
    const adminDb = env.DB?.withSession('first-primary')

    if (pathname.startsWith('/api/') || isDashboardApiPath(pathname)) {
      const runtime: DashboardRuntime = {
        ctx,
        db: adminDb,
        purgeMediaCache: (pathnames) => ctx.exports.CachedMedia.purgePaths(pathnames)
      }
      const adminApi = await handleAdminRequest(request, env, runtime)
      if (adminApi) {
        return withSecurityHeaders(adminApi, { noindex: true })
      }
      const publicApi = await handlePublicApi(request, env, { ctx, db: publicDb })
      if (publicApi) {
        return withSecurityHeaders(publicApi)
      }
      return withSecurityHeaders(json({ error: 'Not found' }, 404))
    }

    if (pathname === '/sitemap.xml') {
      const sitemap = await handleSitemap(request, env, { db: publicDb })
      if (sitemap) {
        return withSecurityHeaders(sitemap)
      }
    }

    if (pathname === '/llms.txt' || pathname === '/llms-full.txt') {
      const llms = await handleLlms(request, env, { db: publicDb })
      if (llms) {
        return withSecurityHeaders(llms)
      }
    }

    const adminPage = isAdminHost(url.hostname)

    if (shouldServeSpaFallback(request, pathname)) {
      const shell = await appShell(env.ASSETS, url.origin)

      if (adminPage) {
        const html = applyAdminRobots(injectCmsPayload(shell, null, { admin: true, path: pathname }))
        return withSecurityHeaders(htmlResponse(html, 200, request.method), { noindex: true })
      }

      if (publicDb) {
        const payload = await buildPublicPayload(publicDb, pathname)
        const html = injectCmsPayload(shell, payload, { path: pathname })
        return withSecurityHeaders(htmlResponse(html, payload.notFound ? 404 : 200, request.method))
      }

      return withSecurityHeaders(htmlResponse(shell, 200, request.method))
    }

    const asset = await env.ASSETS.fetch(request)
    const privatePage = adminPage || isDashboardPath(pathname)
    if (asset.status !== 404) {
      return asPermanentRedirect(asset, request, privatePage)
    }

    return withSecurityHeaders(asset, { noindex: privatePage })
  }
} satisfies ExportedHandler<Env>
