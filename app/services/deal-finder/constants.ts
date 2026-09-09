/** Every Pokémon PSA listing put up today, under €150. */
export const MARKTPLAATS_SEARCH_URL =
  'https://www.marktplaats.nl/q/pokemon+psa/#offeredSince:Vandaag|PriceCentsTo:15000|postcode:3562LH|view:gallery-view'

export const VINTED_SEARCH_URL =
  'https://www.vinted.nl/catalog?search_text=pokemon%20psa&catalog[]=4874&page=1&currency=EUR&order=newest_first&price_to=150'

/**
 * How deep to walk each search. Marktplaats reports how many listings today's search
 * has, so the walk ends the moment it has read them all and this bound is only a
 * runaway guard — three pages of a hundred is already the 300 listings Marktplaats
 * will page through at all. Vinted has no date filter, so the two newest pages are
 * all that is worth reading, and the bound is what keeps the scan out of months of
 * catalogue.
 */
export const MARKTPLAATS_MAX_PAGES = 3
export const VINTED_MAX_PAGES = 2

/**
 * Only buy-worthy asks, measured against the price each site shows: below this it is
 * not worth the postage, above it the search URLs already cut off. Vinted's shown price
 * carries its buyer protection, Marktplaats' does not — `cost.ts` squares that up once
 * a listing is being priced.
 */
export const MIN_ASK = 10
export const MAX_ASK = 150

/** A listing only counts as a deal when Cardmarket's floor beats the ask by at least this much. */
export const MIN_EDGE = 15

/**
 * A Cardmarket floor this far above the ask is nearly always the wrong card — a
 * different art variant, or a Japanese printing of an English single. Both bounds
 * have to be crossed, so a €10 card with a €45 floor is still reported as a deal.
 */
export const IMPLAUSIBLE_FLOOR_RATIO = 4
export const IMPLAUSIBLE_FLOOR_GAP = 200

/** We only chase English and Japanese PSA 9 / PSA 10 singles. */
export const SUPPORTED_GRADES = [9, 10] as const

/** Pause between Google / Cardmarket page loads so the scan does not look like a bot. */
export const FETCH_DELAY_MS = 1000

/**
 * Longest pause between listing pages on Marktplaats and Vinted. These are plain
 * requests for the sort of page a buyer opens by the dozen, and the scan reads one per
 * candidate, so they are paced far more lightly than the searches and the Cardmarket
 * loads — this is a ceiling on `FETCH_DELAY_MS`, never a floor under it. The pause is
 * per site, so Marktplaats and Vinted never wait on each other.
 */
export const LISTING_DELAY_MS = 250

/**
 * How many listings are worked out at once.
 *
 * Reading a listing's page and its photos needs no browser and nothing from Cardmarket,
 * so it is the one part of a scan that can happen several listings at a time — and it
 * runs alongside the Google and Cardmarket work for the listings ahead of it, which is
 * where the scan's remaining time goes. Four keeps the OCR workers busy without racing
 * the marketplaces for pages.
 */
export const IDENTIFY_CONCURRENCY = 4

/** Cardmarket "Show more" clicks before we accept whatever rows we already have. */
export const MAX_LOAD_MORE = 30

/** Which card a listing shows barely changes — re-reading the photos is the expensive half. */
export const IDENTITY_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Cardmarket prices move, so a cached floor is only reused for half a day. */
export const PRICE_TTL_MS = 12 * 60 * 60 * 1000

/** Photos handed to the label reader per listing — the label is rarely past the fourth. */
export const MAX_PHOTOS_PER_LISTING = 4
