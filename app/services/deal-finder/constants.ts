/**
 * The two marketplaces the deal finder walks, and the order they are shown in.
 *
 * Each one is scanned on its own — a Cardmarket bot check on a Marktplaats run should
 * not cost you the Vinted results as well — so this is the default set rather than a
 * fixed one.
 */
export const DEAL_SOURCES = ['marktplaats', 'vinted'] as const

/** Every Pokémon PSA listing put up today, under €150. */
export const MARKTPLAATS_SEARCH_URL =
  'https://www.marktplaats.nl/q/pokemon+psa/#offeredSince:Vandaag|PriceCentsTo:15000|postcode:3562LH|view:gallery-view'

/**
 * `price_from` is `MIN_ASK` said in Vinted's own terms, and it is there to buy reach.
 *
 * Vinted has no date filter, so how far back the scan can see is decided entirely by how
 * much of each page is worth reading — and a quarter of every page used to be cards under
 * a tenner that `MIN_ASK` threw away after they had been fetched. Asking Vinted not to
 * send them nearly doubles both the candidates found and the stretch of time the same
 * three pages cover, without reading a page more.
 *
 * The figure is the seller's price, while the ask the scan screens on is that plus Vinted's
 * buyer protection, so it is set a euro low: a filter that cut where `MIN_ASK` cuts would
 * be the stricter of the two and would drop cards `MIN_ASK` means to keep.
 */
export const VINTED_SEARCH_URL =
  'https://www.vinted.nl/catalog?search_text=pokemon%20psa&catalog[]=4874&page=1&currency=EUR&order=newest_first&price_from=9&price_to=150'

/**
 * How deep to walk each search. Marktplaats does not apply the date window itself, so
 * the scan reads its newest-first pages and keeps only the rows dated inside it; the
 * walk ends at the first page without one, and this bound is only a runaway guard —
 * three pages of a hundred is already the 300 listings Marktplaats will page through
 * at all, and paid "Dagtopper" bumps push today's rows as deep as the third page.
 * Vinted has no date filter, so its bound is what keeps the scan out of months of
 * catalogue; three pages of newest-first is about as far back as a listing is still
 * worth finding.
 */
export const MARKTPLAATS_MAX_PAGES = 3
export const VINTED_MAX_PAGES = 3

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

/**
 * How many other versions of one card number are priced beside the one Google found.
 * A card with more than this is too uncertain to call a deal on and is shown unpriced.
 */
export const MAX_OTHER_VERSIONS = 3

/** Which card a listing shows barely changes — re-reading the photos is the expensive half. */
export const IDENTITY_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Cardmarket prices move, so a cached floor is only reused for half a day. */
export const PRICE_TTL_MS = 12 * 60 * 60 * 1000

/**
 * How long a listing stays written off before it is checked again.
 *
 * Deciding that a listing is not a PSA 9/10 single, or that Cardmarket has no page for
 * the card in it, costs the same listing page, photo reads and Google search as a card
 * that does work out — and the answer is the same every time it is asked, because it is
 * a reading of photos that have not changed. Scans overlap heavily, so re-checking those
 * on every run was most of what a second scan of the day spent its time on. They are
 * remembered instead, and asked again after a week in case the seller added a photo the
 * label is readable in, or Cardmarket has since listed the card.
 */
export const VERDICT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Photos handed to the label reader per listing — the label is rarely past the fourth. */
export const MAX_PHOTOS_PER_LISTING = 4
