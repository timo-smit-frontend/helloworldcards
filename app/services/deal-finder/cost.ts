import type { DealSource } from './types'

/**
 * Marktplaats charges Kopersbescherming on top of the ask: 5% of the purchase, never
 * less than €0.40 and never more than €20. A €100 card costs €5 in protection, a €300
 * card €15, and anything from €400 up the same €20.
 */
const BUYER_PROTECTION = { rate: 0.05, min: 0.4, max: 20 }

/** What postage costs when the listing does not quote it, which on Marktplaats is always. */
const DEFAULT_SHIPPING = 4

/** What a listing costs beyond its ask, and what the lot comes to. */
export type ListingCost = {
  /** Buyer protection charged at checkout; zero when the ask already carries it. */
  fee: number
  shipping: number
  /** The ask plus both — what it takes to have the card in hand. */
  total: number
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Vinted quotes a price that already has its own buyer protection in it — the figure
 * the item page prints as "incl. Vinted-kosten", and the one the scan reads — so only
 * Marktplaats has a fee left to add.
 */
export function buyerProtection(source: DealSource, ask: number): number {
  if (source === 'vinted') {
    return 0
  }
  return round(Math.min(Math.max(ask * BUYER_PROTECTION.rate, BUYER_PROTECTION.min), BUYER_PROTECTION.max))
}

/**
 * What the card really costs. Comparing a bare ask against a Cardmarket floor flatters
 * every listing by the site's cut and the postage, which on a €40 card is most of the
 * edge — so the fees are counted before a listing is called a deal.
 */
export function listingCost(listing: { source: DealSource; ask: number; shipping: number | null }): ListingCost {
  const fee = buyerProtection(listing.source, listing.ask)
  const shipping = listing.shipping ?? DEFAULT_SHIPPING
  return { fee, shipping, total: round(listing.ask + fee + shipping) }
}
