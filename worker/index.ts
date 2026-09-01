import { WorkerEntrypoint } from 'cloudflare:workers'
import { handleAdminRequest } from './cms/admin-api'
import { applyAdminRobots, injectCmsPayload } from './cms/html'
import { handleMediaPublic } from './cms/media'
import { handleLlms, handlePublicApi, handleSitemap } from './cms/public-api'
import { buildPublicPayload } from './cms/public'
import { handleDashboardRequest, isDashboardPath } from './dashboard-api'
import { APEX_HOST, isAdminHost, isLocalHost, publicDashboardRedirect } from './hosts'

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

function isHtml(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html')
}

function withSecurityHeaders(response: Response, options?: { noindex?: boolean }): Response {
  const headers = new Headers(response.headers)

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }

  if (isHtml(response)) {
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

function shouldServeSpaFallback(request: Request, pathname: string): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }

  if (request.headers.get('Sec-Fetch-Mode') === 'navigate') {
    return !FILE_EXTENSION.test(pathname)
  }

  return !FILE_EXTENSION.test(pathname)
}

export class CachedMedia extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const response = await handleMediaPublic(request, this.env, { ctx: this.ctx })
    return (
      response ??
      new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      })
    )
  }

  async purgePath(pathname: string): Promise<void> {
    await this.ctx.cache?.purge({ pathPrefixes: [pathname] })
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

    const adminApi = await handleAdminRequest(request, env, {
      purgeMediaCache: (pathname) => ctx.exports.CachedMedia.purgePath(pathname)
    })
    if (adminApi) {
      return withSecurityHeaders(adminApi, { noindex: true })
    }

    const dashboardApi = await handleDashboardRequest(request, env)
    if (dashboardApi) {
      return withSecurityHeaders(dashboardApi, { noindex: true })
    }

    const publicApi = await handlePublicApi(request, env)
    if (publicApi) {
      return withSecurityHeaders(publicApi)
    }

    if (url.pathname.startsWith('/media/')) {
      return withSecurityHeaders(await ctx.exports.CachedMedia.fetch(request))
    }

    const sitemap = await handleSitemap(request, env)
    if (sitemap) {
      return withSecurityHeaders(sitemap)
    }

    const llms = await handleLlms(request, env)
    if (llms) {
      return withSecurityHeaders(llms)
    }

    const asset = await env.ASSETS.fetch(request)
    const adminPage = isAdminHost(url.hostname)
    const dashboardPage = isDashboardPath(url.pathname)

    if (asset.status !== 404) {
      return asPermanentRedirect(asset, request, adminPage || dashboardPage)
    }

    if (!shouldServeSpaFallback(request, url.pathname)) {
      return withSecurityHeaders(asset, { noindex: adminPage || dashboardPage })
    }

    const index = await env.ASSETS.fetch(new URL('/index.html', url.origin))
    if (!isHtml(index)) {
      return withSecurityHeaders(index, { noindex: adminPage })
    }

    let html = await index.text()
    if (adminPage) {
      html = applyAdminRobots(injectCmsPayload(html, null, { admin: true, path: url.pathname }))
      return withSecurityHeaders(
        new Response(html, {
          status: index.status,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }),
        { noindex: true }
      )
    }

    if (env.DB) {
      const payload = await buildPublicPayload(env.DB, url.pathname)
      html = injectCmsPayload(html, payload, { path: url.pathname })
      const status = payload.notFound ? 404 : index.status
      return withSecurityHeaders(
        new Response(html, {
          status,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      )
    }

    return withSecurityHeaders(index)
  }
} satisfies ExportedHandler<Env>
