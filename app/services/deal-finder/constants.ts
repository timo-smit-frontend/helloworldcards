/** Recent Pokémon PSA listings near us, cheapest-relevant first. */
export const MARKTPLAATS_SEARCH_URL =
  'https://www.marktplaats.nl/q/pokemon+psa/#offeredSince:Vandaag|PriceCentsTo:20000|sortBy:SORT_INDEX|sortOrder:DECREASING|postcode:3562LH|view:gallery-view'

export const VINTED_SEARCH_URL =
  'https://www.vinted.nl/catalog?search_text=pokemon%20psa&catalog[]=4874&page=1&currency=EUR&order=newest_first&price_to=200'

/** Only buy-worthy asks: below this it is not worth the postage, above it the search URLs already cut off. */
export const MIN_ASK = 10
export const MAX_ASK = 200

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

/** Cardmarket "Show more" clicks before we accept whatever rows we already have. */
export const MAX_LOAD_MORE = 30

/** Which card a listing shows barely changes — re-reading the photos is the expensive half. */
export const IDENTITY_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Cardmarket prices move, so a cached floor is only reused for half a day. */
export const PRICE_TTL_MS = 12 * 60 * 60 * 1000

/** Photos handed to the label reader per listing — the label is rarely past the fourth. */
export const MAX_PHOTOS_PER_LISTING = 4
