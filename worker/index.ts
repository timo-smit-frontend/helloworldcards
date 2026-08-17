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
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://scripts.clarity.ms https://www.clarity.ms",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://raw.githubusercontent.com https://www.googletagmanager.com https://*.googletagmanager.com https://*.google-analytics.com https://*.clarity.ms https://c.bing.com",
    "font-src 'self'",
    "connect-src 'self' https://formsubmit.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com",
    'frame-src https://www.googletagmanager.com https://td.doubleclick.net',
    "worker-src 'self' blob:"
  ].join('; ')
}

function isHtml(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html')
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }

  if (isHtml(response)) {
    for (const [name, value] of Object.entries(HTML_SECURITY_HEADERS)) {
      headers.set(name, value)
    }
  }

  if (response.status >= 400) {
    headers.set('Cache-Control', 'no-store')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

function canonicalUrl(request: Request): URL | null {
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

  return changed ? url : null
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
    const redirectTo = canonicalUrl(request)
    if (redirectTo) {
      return Response.redirect(redirectTo.href, 301)
    }

    const url = new URL(request.url)
    const asset = await env.ASSETS.fetch(request)

    if (asset.status !== 404) {
      return withSecurityHeaders(asset)
    }

    if (!shouldServeSpaFallback(request, url.pathname)) {
      return withSecurityHeaders(asset)
    }

    const index = await env.ASSETS.fetch(new URL('/index.html', url.origin))
    return withSecurityHeaders(index)
  }
} satisfies ExportedHandler<Env>
