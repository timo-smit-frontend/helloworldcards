import { MAX_ASK, MIN_ASK } from './constants'
import {
  deniesPsa,
  detectAnyGrade,
  detectGrade,
  detectLanguage,
  isSpeculativeGrade,
  looksLikeLot,
  looksUngraded,
  rivalGrader
} from './text'
import type { SourceListing } from './types'

/** Auction houses relist the same slabs with buyer premiums — never a deal for us. */
const AUCTION_HOUSE = /catawiki|veiling/i

/** Marktplaats sells both single cards and stacks; only the single is priceable. */
const MULTI_CARD_ATTRIBUTE = /meerdere/i

/**
 * Both feeds mix other trading card games into a Pokémon search — a One Piece or
 * Yu-Gi-Oh slab priced against a Pokémon single is a wrong answer, not a deal.
 * A listing only counts as another game when it names one and never names Pokémon,
 * so a seller who mentions their One Piece binder alongside a Charizard is still checked.
 */
const OTHER_TCG =
  /\b(?:one\s*piece|op\d{2}|yu-?gi-?oh|yugioh|ygo|konami|magic:?\s*the\s*gathering|mtg|dragon\s*ball|digimon|lorcana|weiss\s*schwarz|metazoo|flesh\s*and\s*blood|union\s*arena|naruto|fortnite|star\s*wars|marvel|garbage\s*pail|panini|topps)\b/i

const POKEMON = /pok[eé]?mon/i

/** The listing claims a PSA slab, even where it never says which grade. */
const NAMES_PSA = /\bpsa\b/i

/**
 * Slab guards, toploaders and binders sell alongside the cards, and their photos show a
 * real graded card sitting in the product — so the label reader finds a genuine PSA slab
 * and the listing prices as if that card were for sale. A €10 "PSA Slab Guard" came back
 * as a Meditite worth €120. What is being sold is the plastic, so it is named in the title.
 */
const ACCESSORY =
  /\b(?:slab\s*guard|slabguard|top\s*loader|toploader|penny\s*sleeve|card\s*sleeves?|beschermhoes|hoesjes?|bumper|(?:card\s*)?protector(?:es|s)?|screw\s*down|screwdown|magnetic\s*holder|acryl|verzamelmap|opbergmap|binder|vitrine|display\s*(?:case|stand|kast))\b/i

/**
 * A card thrown in with a sleeve is still a card: `Charizard PSA 10 incl. toploader`
 * sells the Charizard, and the preposition in front of the plastic is what says so.
 */
const THROWN_IN = /\b(?:incl\.?|inclusief|inclusive|met|in|plus|with|\+)\s+(?:een |de |het |a |an |the )?$/i

/** True when the title is selling the plastic rather than a card sitting in it. */
export function isAccessoryListing(title: string): boolean {
  const match = title.match(ACCESSORY)
  return match?.index != null && !THROWN_IN.test(title.slice(0, match.index))
}

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

  const listingText = [listing.title, listing.description].filter(Boolean).join('\n')
  if (OTHER_TCG.test(listingText) && !POKEMON.test(listingText)) {
    return { keep: false, scope: 'out-of-scope', reason: 'Not a Pokémon card' }
  }

  if (isAccessoryListing(listing.title)) {
    return { keep: false, scope: 'out-of-scope', reason: 'Selling a case or sleeve, not a card' }
  }

  if (listing.priceType && !/^(?:FIXED|MIN_BID)$/i.test(listing.priceType)) {
    return { keep: false, scope: 'out-of-scope', reason: 'Bidding only, no asking price' }
  }

  if (!detectGrade(listingText)) {
    if (looksUngraded(listingText)) {
      return { keep: false, scope: 'out-of-scope', reason: 'Raw card, not in a PSA slab' }
    }
    if (isSpeculativeGrade(listingText)) {
      return { keep: false, scope: 'out-of-scope', reason: 'Raw card, the PSA grade is only what the seller expects' }
    }
    const other = detectAnyGrade(listingText)
    if (other != null) {
      return { keep: false, scope: 'out-of-scope', reason: `Graded PSA ${other}, not 9 or 10` }
    }
    if (deniesPsa(listingText)) {
      return { keep: false, scope: 'out-of-scope', reason: 'Seller says the slab is not PSA' }
    }
    const rival = rivalGrader(listingText)
    if (rival) {
      return { keep: false, scope: 'out-of-scope', reason: `Graded by ${rival}, not PSA` }
    }
    if (!NAMES_PSA.test(listingText)) {
      return { keep: false, scope: 'out-of-scope', reason: 'Not a PSA 9 or 10 listing' }
    }
    // The listing says PSA and will not say which grade. On Vinted that is the normal
    // case rather than an odd one: a catalogue row carries no description at all, so
    // "Mega Charizard X ex Japanese PSA" is the whole of what there is to screen on
    // while the grade sits in the description the scan has not read yet. The slab in
    // the photos settles it either way, and the label reader is the thing that reads
    // slabs — so this one goes through to it rather than being written off on a title.
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
