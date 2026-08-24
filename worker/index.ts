import { handleDashboardRequest, isDashboardPath } from './dashboard-api'

const APEX_HOST = 'helloworldcards.com'
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
    // Hashed JS is deleted on deploy; cached HTML would 404 the previous bundle.
    headers.set('Cache-Control', 'no-store')
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

function applyDashboardRobots(html: string): string {
  return html
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/i, '<meta name="robots" content="noindex, nofollow, noarchive" />')
    .replace(/<link rel="canonical"[^>]*>\s*/i, '')
    .replace(/<meta property="og:url"[^>]*>\s*/i, '')
    .replace(/<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/i, '')
}

function canonicalRequestUrl(request: Request): URL | null {
  const url = new URL(request.url)
  let changed = false

  if (url.protocol === 'http:') {
    url.protocol = 'https:'
    changed = true
  }

  if (url.hostname === `www.${APEX_HOST}`) {
    url.hostname = APEX_HOST
    changed = true
  }

  const canSlash =
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

function redirectPermanently(url: URL): Response {
  return withSecurityHeaders(Response.redirect(url.href, 301))
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

export default {
  async fetch(request, env): Promise<Response> {
    const redirectTo = canonicalRequestUrl(request)
    if (redirectTo) {
      return redirectPermanently(redirectTo)
    }

    const url = new URL(request.url)
    const dashboardApi = await handleDashboardRequest(request, env)
    if (dashboardApi) {
      return withSecurityHeaders(dashboardApi, { noindex: true })
    }

    const asset = await env.ASSETS.fetch(request)
    const dashboardPage = isDashboardPath(url.pathname)

    if (asset.status !== 404) {
      return asPermanentRedirect(asset, request, dashboardPage)
    }

    if (!shouldServeSpaFallback(request, url.pathname)) {
      return withSecurityHeaders(asset, { noindex: dashboardPage })
    }

    const index = await env.ASSETS.fetch(new URL('/index.html', url.origin))
    if (dashboardPage && isHtml(index)) {
      const html = applyDashboardRobots(await index.text())
      return withSecurityHeaders(
        new Response(html, {
          status: index.status,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }),
        { noindex: true }
      )
    }

    return withSecurityHeaders(index)
  }
} satisfies ExportedHandler<Env>
