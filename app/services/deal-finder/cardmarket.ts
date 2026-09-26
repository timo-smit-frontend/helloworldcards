import { parseArticleListings } from '../cardmarket/html'
import { marketFloorPrice, type MarketListing } from '../cardmarket/grades'
import { cardmarketOffersUrl, isCardmarketChallenge } from '../cardmarket/scan'
import { MAX_LOAD_MORE } from './constants'
import type { CardIdentity } from './types'

/** Raised when Cardmarket's bot check stopped us reading a product page. */
export class CardmarketBlockedError extends Error {
  constructor(message = 'Cardmarket blocked the page (bot check).') {
    super(message)
    this.name = 'CardmarketBlockedError'
  }
}

/** The offers URL for this exact card: right language, variety and condition floor. */
export function offersUrlFor(productUrl: string, identity: CardIdentity): string {
  return cardmarketOffersUrl(productUrl, identity.language, {
    reverseHolo: identity.reverseHolo,
    firstEdition: identity.firstEdition,
    grade: identity.grade
  })
}

/**
 * Cardmarket sorts offers by price ascending, so the first same-grade PSA row we
 * reach while clicking "Show more" is the floor — but slabs sit well down the list,
 * so we keep expanding until it appears or the list truly ends.
 */
function hasGradeComp(html: string, grade: number): boolean {
  return marketFloorPrice({ grader: 'psa', grade, listings: parseArticleListings(html) }) != null
}

export const OFFERS_FETCH_OPTIONS = (grade: number) => ({
  maxLoadMore: MAX_LOAD_MORE,
  stopWhen: (html: string) => hasGradeComp(html, grade)
})

export type MarketPrice = { floor: number; comps: MarketListing[] }

const CARDMARKET_ORIGIN = 'https://www.cardmarket.com'

/** Any link to a singles product, relative or absolute, in any of Cardmarket's languages. */
const PRODUCT_LINK = /\/(?:[a-z]{2}\/)?Pokemon\/Products\/Singles\/([^/"'?#\s<>]+)\/([^/"'?#&\s<>]+)/gi

function productParts(url: string): { set: string; slug: string } | null {
  const match = url.match(/\/Pokemon\/Products\/Singles\/([^/"'?#\s<>]+)\/([^/"'?#&\s<>]+)/i)
  return match ? { set: match[1]!, slug: match[2]! } : null
}

/**
 * `Magneton-V2-SVP159` → name `magneton`, card `svp159`.
 *
 * The last segment is the set code and number run together, and is the whole of what
 * tells two cards of one name apart; the `-V2` before it only says Cardmarket has more
 * than one product by that name in the expansion.
 */
function productCard(slug: string): { name: string; card: string } {
  const parts = slug.split('-').filter((part) => !/^V\d+$/i.test(part))
  const card = parts.length > 1 ? parts.pop()! : ''
  return { name: parts.join('-').toLowerCase(), card: card.toLowerCase() }
}

/**
 * Whether Cardmarket sells more than one product by this card's name in its expansion.
 *
 * It marks every one of them `-V1-`, `-V2-` and so on. Mostly they are different cards —
 * Charmander 004 and 168 in 151 — but sometimes they are the same card number twice:
 * Magneton SVP 159 from the Surging Sparks Elite Trainer Box, and the same card with a
 * Pokémon Center stamp at twice the price.
 */
export function isVersionedProduct(url: string): boolean {
  const parts = productParts(url)
  return parts != null && /-V\d+-/i.test(`-${parts.slug}-`)
}

/** The product page's "Reprints: Show Versions" link, to the list of every printing of the card. */
export function cardmarketVersionsUrl(html: string): string | null {
  const href = html.match(/href="([^"]*\/Pokemon\/Cards\/[^"/?#]+\/Versions)(?:[?#][^"]*)?"/i)?.[1]
  if (!href) {
    return null
  }
  return href.startsWith('http') ? href.replace(/&amp;/g, '&') : `${CARDMARKET_ORIGIN}${href.startsWith('/') ? '' : '/'}${href}`
}

/**
 * The other products on a versions page that are this very card: same expansion, same
 * name, same set code and number. What sets them apart — a stamp — is only in the photo.
 */
export function sameCardVersions(html: string, productUrl: string): string[] {
  const own = productParts(productUrl)
  if (!own) {
    return []
  }
  const ownCard = productCard(own.slug)
  const found = new Map<string, string>()

  for (const match of html.matchAll(PRODUCT_LINK)) {
    const [set, slug] = [match[1]!, match[2]!]
    const card = productCard(slug)
    if (
      set.toLowerCase() === own.set.toLowerCase() &&
      slug.toLowerCase() !== own.slug.toLowerCase() &&
      card.name === ownCard.name &&
      card.card === ownCard.card
    ) {
      found.set(slug.toLowerCase(), `${CARDMARKET_ORIGIN}/en/Pokemon/Products/Singles/${set}/${slug}`)
    }
  }

  return [...found.values()]
}

export function priceFromOffers(html: string, grade: number): MarketPrice | { error: string } {
  if (isCardmarketChallenge(html)) {
    throw new CardmarketBlockedError()
  }

  const listings = parseArticleListings(html)
  if (listings.length === 0 && !html.includes('articleRow')) {
    return { error: 'No offers on the Cardmarket page' }
  }

  const market = marketFloorPrice({ grader: 'psa', grade, listings })
  if (!market) {
    return { error: `Nobody is selling a PSA ${grade} on Cardmarket` }
  }

  return { floor: market.floor, comps: market.basis }
}
