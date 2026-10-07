import type { MarketListing } from '../cardmarket/grades'
import { COMPS_MIN_ASK } from './constants'
import { EU_COUNTRIES, type EbayItem } from './ebay'
import { marktplaatsSearchPageUrl, parseMarktplaatsOverview } from './marktplaats'
import type { RememberedListing } from './memory'
import { mentionsCharacter, topCharacter } from './popular'
import { detectAllGrades, detectCardNumber, detectLanguage, detectSet, detectStatedLanguage, looksLikeLot, looksUngraded } from './text'
import type { CardIdentity, Comp } from './types'

/** What a competing listing has to share with the card to be competing with it. */
export type CardFacts = Pick<CardIdentity, 'name' | 'cardNumber' | 'setName' | 'language' | 'grade'>

/** The digits a card number comes down to: `SWSH039` and `39` are the same card, `215/203` is 215. */
function numberDigits(value: string): number | null {
  const digits = value.split('/')[0]!.match(/(\d+)(?!.*\d)/)?.[1]
  return digits ? Number(digits) : null
}

function setKey(name: string | null | undefined): string | null {
  const found = name ? detectSet(name).name : null
  return found ? found.toLowerCase().replace(/s$/, '').replace(/\s+/g, ' ') : null
}

/**
 * Whether another seller's listing is this very card — character, number, grade and
 * language — on nothing but what they wrote.
 *
 * Each fact has to be stated, not merely left uncontradicted: a listing that does not
 * give its number could be any of the character's cards, and pricing against the wrong
 * one is worse than having nothing to price against. So most competitors that are the
 * same card but say less are missed; that is the price of never being compared with a
 * different card.
 *
 * `stated` is for eBay, where a German seller of an English card writes "Pokemon Karte":
 * only a language named outright counts there, not the language the text is written in.
 */
export function isSameCard(
  listed: { title: string; description?: string | null },
  card: CardFacts,
  { languages = 'written' }: { languages?: 'written' | 'stated' } = {}
): boolean {
  const { title } = listed
  const description = listed.description ?? ''
  const character = topCharacter(card.name)
  if (!character || !mentionsCharacter(title, character) || looksLikeLot(title) || looksUngraded(title)) {
    return false
  }

  // The grade from the title, or from the description when the title gives none — and
  // one grade only: a text naming two is about two slabs.
  const titleGrades = detectAllGrades(title)
  const grades = titleGrades.length > 0 ? titleGrades : detectAllGrades(description)
  if (grades.length !== 1 || grades[0] !== card.grade) {
    return false
  }

  const language = languages === 'stated' ? detectStatedLanguage : detectLanguage
  const said = language(title) ?? language(description)
  if (said === 'other' || (card.language === 'japanese') !== (said === 'japanese')) {
    return false
  }

  const wanted = card.cardNumber ? numberDigits(card.cardNumber) : null
  if (wanted == null) {
    return false
  }
  const titleSet = detectSet(title)
  // A promo code is both the set and half the number — `025/SV-P` — so a number the set
  // was masked out of is looked for again with the set left in, stated outright only.
  const printed =
    detectCardNumber(title, titleSet.matched) ??
    detectCardNumber(title, null, { allowBare: false }) ??
    detectCardNumber(description, null, { allowBare: false })
  if (printed == null || numberDigits(printed) !== wanted) {
    return false
  }

  // Two sets named, and not the same one: the same number in another set is another card.
  const cardSet = setKey(card.setName)
  const listedSet = setKey(titleSet.name)
  return cardSet == null || listedSet == null || cardSet === listedSet
}

/**
 * The facts `isSameCard` decides on, as one key. Two cards that agree on all of them get
 * the same competitors, so a comparison search is remembered under this and nothing else.
 */
export function compsKey(card: CardFacts): string {
  const number = card.cardNumber ? numberDigits(card.cardNumber) : null
  return [topCharacter(card.name), number, card.grade, card.language, setKey(card.setName)].map((part) => part ?? '').join('|')
}

/** What the comparison searches ask for: the character and the number, as sellers write them. */
export function compsQuery(card: CardFacts): string | null {
  const character = topCharacter(card.name)
  return character && card.cardNumber ? `${character} ${card.cardNumber}` : null
}

/**
 * Marktplaats' search for everyone selling the card: the character, its number and PSA,
 * any price from a fiver up and any age — the competition, not just today's listings.
 */
export function marktplaatsCompsUrl(card: CardFacts): string | null {
  const query = compsQuery(card)
  if (!query) {
    return null
  }
  const browse = `https://www.marktplaats.nl/q/${encodeURIComponent(`${query} psa`).replace(/%20/g, '+')}/#PriceCentsFrom:${COMPS_MIN_ASK * 100}`
  return marktplaatsSearchPageUrl(browse, 1)
}

/** The listings in a Marktplaats search answer that are this card, priced as their sellers ask. */
export function marktplaatsComps(payload: string, card: CardFacts, seenAt: string): Comp[] {
  return parseMarktplaatsOverview(payload)
    .filter((listing) => /^(?:FIXED|MIN_BID)$/i.test(listing.priceType) && listing.ask >= COMPS_MIN_ASK)
    .filter((listing) => isSameCard(listing, card))
    .map((listing) => ({
      id: listing.id,
      source: 'marktplaats' as const,
      price: listing.ask,
      shipping: null,
      title: listing.title,
      url: listing.listingUrl,
      seller: listing.sellerName,
      country: 'NL',
      seenAt
    }))
}

/** Vinted listings earlier scans saw that are this card, at what their sellers ask before Vinted's fees. */
export function rememberedComps(rows: RememberedListing[], card: CardFacts): Comp[] {
  return rows
    .filter((row) => isSameCard(row, card))
    .map((row) => ({
      id: row.id,
      source: row.source,
      price: row.sellerAsk,
      shipping: null,
      title: row.title,
      url: row.url,
      seller: null,
      country: null,
      seenAt: row.firstSeen
    }))
}

/**
 * eBay listings that are this card from a seller inside the EU, at what they cost a buyer
 * here: the price plus the postage to the Netherlands.
 */
export function ebayComps(items: EbayItem[], card: CardFacts, seenAt: string): Comp[] {
  return items
    .filter((item) => item.country != null && EU_COUNTRIES.has(item.country))
    .filter((item) => isSameCard(item, card, { languages: 'stated' }))
    .map((item) => ({
      id: `ebay:${item.itemId}`,
      source: 'ebay' as const,
      price: Math.round((item.price + (item.shipping ?? 0)) * 100) / 100,
      shipping: item.shipping,
      title: item.title,
      url: item.url,
      seller: item.seller,
      country: item.country,
      seenAt
    }))
}

/** The Cardmarket offers a floor was read from, as competitors. */
export function cardmarketComps(listings: MarketListing[], offersUrl: string | null, seenAt: string): Comp[] {
  return listings.map((listing) => ({
    id: `cardmarket:${listing.id}`,
    source: 'cardmarket' as const,
    price: listing.price,
    shipping: null,
    title: listing.comment,
    url: offersUrl,
    seller: listing.seller,
    country: null,
    seenAt
  }))
}
