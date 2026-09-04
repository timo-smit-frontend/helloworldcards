import { MAX_ASK, MIN_ASK } from './constants'
import { detectAnyGrade, detectGrade, detectLanguage, looksLikeLot } from './text'
import type { SourceListing } from './types'

/** Auction houses relist the same slabs with buyer premiums — never a deal for us. */
const AUCTION_HOUSE = /catawiki|veiling/i

/** Marktplaats sells both single cards and stacks; only the single is priceable. */
const MULTI_CARD_ATTRIBUTE = /meerdere/i

export type Screening =
  { keep: true } | { keep: false; scope: 'out-of-scope'; reason: string } | { keep: false; scope: 'problem'; reason: string }

export type OwnListingIds = { marktplaats: Set<string>; vinted: Set<string> }

const MARKTPLAATS_ID = /\bm(\d{6,})\b/i
const VINTED_ID = /\/items\/(\d+)/

/** Our own ads show up in the same feed we scan — skip them instead of buying from ourselves. */
export function ownListingIds(products: Array<{ marktplaatsUrl?: string | null; vintedUrl?: string | null }>): OwnListingIds {
  const marktplaats = new Set<string>()
  const vinted = new Set<string>()

  for (const product of products) {
    const mp = product.marktplaatsUrl?.match(MARKTPLAATS_ID)?.[1]
    if (mp) {
      marktplaats.add(mp)
    }
    const vt = product.vintedUrl?.match(VINTED_ID)?.[1]
    if (vt) {
      vinted.add(vt)
    }
  }

  return { marktplaats, vinted }
}

export function isOwnListing(listing: SourceListing, ids: OwnListingIds): boolean {
  if (listing.source === 'marktplaats') {
    const id = listing.listingUrl.match(MARKTPLAATS_ID)?.[1] ?? listing.listingId.replace(/^m/, '')
    return ids.marktplaats.has(id)
  }
  return ids.vinted.has(listing.listingId)
}

/**
 * Decide whether a listing is worth the cost of reading its photos. Anything we
 * simply do not buy is counted and dropped silently; anything we cannot price
 * even though it looks relevant is surfaced as a problem instead.
 */
export function screenListing(listing: SourceListing, ids: OwnListingIds): Screening {
  if (isOwnListing(listing, ids)) {
    return { keep: false, scope: 'out-of-scope', reason: 'One of our own listings' }
  }

  if (listing.ask < MIN_ASK) {
    return { keep: false, scope: 'out-of-scope', reason: `Asking under €${MIN_ASK}` }
  }

  if (listing.ask > MAX_ASK) {
    return { keep: false, scope: 'out-of-scope', reason: `Asking over €${MAX_ASK}` }
  }

  if (listing.sellerName && AUCTION_HOUSE.test(listing.sellerName)) {
    return { keep: false, scope: 'out-of-scope', reason: 'Auction house listing' }
  }

  if (listing.priceType && !/^(?:FIXED|MIN_BID)$/i.test(listing.priceType)) {
    return { keep: false, scope: 'out-of-scope', reason: 'Bidding only, no asking price' }
  }

  const text = [listing.title, listing.description].filter(Boolean).join('\n')
  if (!detectGrade(text)) {
    const other = detectAnyGrade(text)
    return {
      keep: false,
      scope: 'out-of-scope',
      reason: other != null ? `Graded PSA ${other}, not 9 or 10` : 'Not a PSA 9 or 10 listing'
    }
  }

  if (detectLanguage(listing.title) === 'other') {
    return { keep: false, scope: 'out-of-scope', reason: 'Not an English or Japanese card' }
  }

  if (listing.itemType && MULTI_CARD_ATTRIBUTE.test(listing.itemType)) {
    return { keep: false, scope: 'problem', reason: 'Several cards in one listing' }
  }

  if (looksLikeLot(listing.title)) {
    return { keep: false, scope: 'problem', reason: 'Several cards in one listing' }
  }

  return { keep: true }
}
