import { parseArticleListings } from '../cardmarket/html'
import { marketFloorPrice, type MarketListing } from '../cardmarket/grades'
import { cardmarketOffersUrl, isCardmarketChallenge } from '../cardmarket/scan'
import { MAX_LOAD_MORE } from './constants'
import type { CardIdentity } from './types'

export { isCardmarketChallenge } from '../cardmarket/scan'

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
export function hasGradeComp(html: string, grade: number): boolean {
  return marketFloorPrice({ grader: 'psa', grade, listings: parseArticleListings(html) }) != null
}

export const OFFERS_FETCH_OPTIONS = (grade: number) => ({
  maxLoadMore: MAX_LOAD_MORE,
  stopWhen: (html: string) => hasGradeComp(html, grade)
})

export type MarketPrice = { floor: number; comps: MarketListing[] }

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
