export const SITE_URL = 'https://helloworldcards.com'
export const SITE_NAME = 'Hello World Cards'
export const SITE_LOCALE = 'en_GB'
export const SITE_DESCRIPTION =
  'Pokémon cards from Sam and Timo, listed here and on Marktplaats. Sam paints custom binders that we show on the site and sell at events.'
export const SITE_IMAGE = '/images/hero.jpg'

export function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export const SITE_THEME_COLOR = '#1c2030'
