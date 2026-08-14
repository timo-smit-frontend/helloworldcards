export const SITE_URL = 'https://helloworldcards.com'
export const SITE_NAME = 'Hello World Cards'
export const SITE_LOCALE = 'en_GB'
export const SITE_DESCRIPTION =
  'Pokémon cards, art, and events from Sam & Timo. A little shop that still feels like two friends sharing a hobby.'
export const SITE_IMAGE = '/images/hero.jpg'

export function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export const SITE_THEME_COLOR = '#1c2030'
