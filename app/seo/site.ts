export const SITE_URL = 'https://helloworldcards.com'
export const SITE_NAME = 'Hello World Cards'
export const SITE_LOCALE = 'en_GB'
export const SITE_DESCRIPTION =
  'Pokémon cards from Sam and Timo, listed here and on Marktplaats. Sam paints custom binders that we show on the site and sell at events.'
export const SITE_IMAGE = '/media/hero.jpg'

export function normalizePath(pathname: string): string {
  const path = pathname.split('?')[0]?.split('#')[0] ?? '/'
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1)
  }
  return path || '/'
}

export function isCurrentPath(pathname: string, href: string): boolean {
  const current = normalizePath(pathname)
  const target = normalizePath(href)

  if (target === '/') return current === '/'
  return current === target || current.startsWith(`${target}/`)
}

export function canonicalUrl(path: string): string {
  const normalized = normalizePath(path)
  return normalized === '/' ? `${SITE_URL}/` : `${SITE_URL}${normalized}/`
}

export function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export const SITE_THEME_COLOR = '#1c2030'
