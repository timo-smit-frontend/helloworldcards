import type { MarketListing } from '../cardmarket/grades'
import { COMPS_TTL_MS, IDENTITY_TTL_MS, PRICE_TTL_MS, VERDICT_TTL_MS } from './constants'
import type { CardIdentity, Comp, DealSource, PsaLabel } from './types'

/**
 * What we already know about one listing. Identifying a card costs a photo read,
 * a Google search and a Cardmarket page load, and none of that changes once a
 * listing is up — so it is remembered and only the price is refreshed.
 */
export type CacheEntry = {
  id: string
  ask: number
  /** Postage read off the listing page, so a cached row still costs what it costs. */
  shipping: number | null
  /** When the card was worked out from the photos and the listing text. */
  identifiedAt: string
  identity: CardIdentity | null
  label: PsaLabel | null
  query: string | null
  googleUrl: string | null
  cardmarketUrl: string | null
  /** When Cardmarket was last read. */
  pricedAt: string | null
  floor: number | null
  comps: MarketListing[]
  /**
   * Why this listing could not be checked. A problem the listing itself settles — it is
   * not the card we thought, or Cardmarket has no page for it — is remembered and served
   * back; one that is really the scan's own trouble, a Cardmarket bot check or a page
   * that would not load, is always retried.
   */
  problem: { stage: 'listing' | 'identify' | 'match' | 'price'; reason: string; detail: string | null } | null
}

/**
 * Bumped whenever identification, matching or screening changes. A cached row is a
 * conclusion this code reached, not a fact about the listing, so a scan that reasons
 * differently must not be served yesterday's answer — the TTLs cannot see that the
 * rules moved, only that the clock did.
 *
 * 7: the labels are read with Apple Vision, so every listing Tesseract wrote off is
 * worth reading again.
 */
export const CACHE_VERSION = 7

/**
 * Which Cardmarket product a card is, as the Google search for it found — or that it
 * found none. Keyed by the card rather than by a listing, because the same card turns
 * up in listing after listing, on both marketplaces and day after day, and the answer
 * does not change with the listing it came from.
 */
export type ProductMatch = {
  url: string | null
  query: string
  googleUrl: string
  at: string
}

/**
 * What one Cardmarket offers page said about one card in one grade: its floor, or why
 * there is none. Shared across listings the same way, for as long as a price is trusted.
 */
export type RememberedFloor = {
  /** The version that was priced — the cheapest, when Cardmarket sells the card more than once. */
  productUrl: string
  floor: number | null
  comps: MarketListing[]
  error: string | null
  /** The page turned out to be a different card from the one searched for. */
  wrongCard: boolean
  at: string
}

/**
 * What PSA's own records say about a certification number. A cert never changes, so the
 * answer is kept for good, and the lookups it took are what the daily allowance is counted
 * in. A number PSA did not know is kept too, so it is not asked about again tomorrow.
 */
export type RememberedCert = {
  label: PsaLabel | null
  at: string
}

/**
 * What one comparison search found for a card: Marktplaats or eBay, per card and grade.
 * Shared across listings like a floor, for as long as other sellers' asks are trusted.
 */
export type RememberedComps = {
  comps: Comp[]
  at: string
}

export type DealFinderCache = {
  version?: number
  entries: Record<string, CacheEntry>
  products?: Record<string, ProductMatch>
  floors?: Record<string, RememberedFloor>
  certs?: Record<string, RememberedCert>
  comps?: Record<string, RememberedComps>
}

/** The cache to start from: the stored one, or a fresh one when older logic wrote it. */
export function usableCache(stored: DealFinderCache | null | undefined): DealFinderCache {
  return stored && stored.version === CACHE_VERSION
    ? {
        version: CACHE_VERSION,
        entries: { ...stored.entries },
        products: { ...stored.products },
        floors: { ...stored.floors },
        certs: { ...stored.certs },
        comps: { ...stored.comps }
      }
    : emptyCache()
}

function emptyCache(): DealFinderCache {
  return { version: CACHE_VERSION, entries: {}, products: {}, floors: {}, certs: {}, comps: {} }
}

const DAY_MS = 24 * 60 * 60 * 1000

function ageMs(iso: string | null, now: Date): number {
  if (!iso) {
    return Number.POSITIVE_INFINITY
  }
  const at = Date.parse(iso)
  return Number.isFinite(at) ? now.getTime() - at : Number.POSITIVE_INFINITY
}

/**
 * A remembered card identity is reusable for a month — the listing still shows the same slab.
 *
 * That holds when it was the matching or pricing that went wrong rather than the reading:
 * a card Cardmarket had no page for is still the card the photos showed, and pricing it
 * against everyone else selling it does not need the photos read a second time.
 */
export function hasFreshIdentity(entry: CacheEntry | undefined, now: Date): boolean {
  if (!entry || !entry.identity || entry.problem?.stage === 'identify' || entry.problem?.stage === 'listing') {
    return false
  }
  return ageMs(entry.identifiedAt, now) < IDENTITY_TTL_MS
}

/**
 * A card's Cardmarket product, as long as it is worth trusting: a month for a page that
 * was found — products do not move — and the week a written-off listing gets for a
 * search that found nothing, in case Cardmarket has listed the card since.
 */
export function hasFreshMatch(match: ProductMatch | undefined, now: Date): match is ProductMatch {
  return match != null && ageMs(match.at, now) < (match.url ? IDENTITY_TTL_MS : VERDICT_TTL_MS)
}

/** A card's remembered floor, for as long as any Cardmarket price is trusted. */
export function hasFreshFloor(floor: RememberedFloor | undefined, now: Date): floor is RememberedFloor {
  return floor != null && ageMs(floor.at, now) < PRICE_TTL_MS
}

/** Another seller's ask is only trusted for half a day, like a floor. */
export function hasFreshComps(record: RememberedComps | undefined, now: Date): record is RememberedComps {
  return record != null && ageMs(record.at, now) < COMPS_TTL_MS
}

/** How many PSA cert lookups the scans made in the day before `now` — the allowance is per day. */
export function certLookupsSince(cache: DealFinderCache, now: Date): number {
  return Object.values(cache.certs ?? {}).filter((cert) => ageMs(cert.at, now) < DAY_MS).length
}

/** A remembered Cardmarket floor is only reused for half a day, and only at the same ask. */
export function hasFreshPrice(entry: CacheEntry | undefined, now: Date, ask: number): boolean {
  if (!entry || !hasFreshIdentity(entry, now) || entry.floor == null || entry.ask !== ask) {
    return false
  }
  return ageMs(entry.pricedAt, now) < PRICE_TTL_MS
}

/**
 * A conclusion the listing itself settles, which asking again would only reach a second time.
 *
 * The photos were read and the slab is not a card we buy, or could not be read at all.
 * That is a reading of a listing that is not going to change, so it is answered from here
 * rather than read again.
 *
 * A card no Cardmarket page matched is not one of them any more: Cardmarket is one source
 * among several, and the card is priced against the others every scan — from its remembered
 * identity, without its photos being read again. Nor is a Cardmarket bot check or a page
 * that would not load, which is the scan having a bad moment, not a fact about the listing.
 */
function isSettled(entry: CacheEntry): boolean {
  if (!entry.problem) {
    return entry.identity == null
  }
  return entry.problem.stage === 'identify'
}

/**
 * A written-off listing that is still written off: same asking price, and checked within
 * the week. A changed ask means the seller has been back in the listing, so it is read
 * again in case the photos changed with it.
 */
export function hasSettledVerdict(entry: CacheEntry | undefined, now: Date, ask: number): boolean {
  if (!entry || !isSettled(entry) || entry.ask !== ask) {
    return false
  }
  return ageMs(entry.identifiedAt, now) < VERDICT_TTL_MS
}

/**
 * A card Cardmarket had no page for, still within the week that answer is trusted for and
 * at the same ask. The card is priced against everyone else without Google being asked
 * again — and the week keeps running from the scan that asked.
 */
export function hasSettledMatch(entry: CacheEntry | undefined, now: Date, ask: number): boolean {
  if (!entry || entry.problem?.stage !== 'match' || entry.ask !== ask) {
    return false
  }
  return ageMs(entry.identifiedAt, now) < VERDICT_TTL_MS
}

/** Which source a cache key belongs to — the key is the listing id, `vinted:123`. */
function sourceOf(id: string): string {
  return id.split(':')[0] ?? ''
}

/**
 * Forget listings that were not in this scan, so the cache tracks the live feed.
 *
 * Only the sources this scan actually walked are pruned. A Marktplaats run knows
 * nothing about which Vinted listings are still up, and dropping them would make the
 * next Vinted run re-read every photo it already read.
 */
export function pruneCache(
  cache: DealFinderCache,
  liveIds: Set<string>,
  sources: readonly DealSource[],
  now = new Date()
): DealFinderCache {
  const scanned = new Set<string>(sources)
  const entries: Record<string, CacheEntry> = {}
  for (const [id, entry] of Object.entries(cache.entries)) {
    if (liveIds.has(id) || !scanned.has(sourceOf(id))) {
      entries[id] = entry
    }
  }
  // Cards are not tied to a listing, so they go when they are too old to be used. A
  // cert never goes stale, but the allowance only needs the last day of them and a cert
  // a year old is from a slab long sold.
  return {
    version: CACHE_VERSION,
    entries,
    products: keep(cache.products, (match) => hasFreshMatch(match, now)),
    floors: keep(cache.floors, (floor) => hasFreshFloor(floor, now)),
    certs: keep(cache.certs, (cert) => ageMs(cert.at, now) < 365 * DAY_MS),
    comps: keep(cache.comps, (record) => hasFreshComps(record, now))
  }
}

function keep<T>(records: Record<string, T> | undefined, fresh: (record: T) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(records ?? {}).filter(([, record]) => fresh(record)))
}

/** Of two answers about the same card, the one asked for last. */
function newest<T extends { at: string }>(...sides: Array<Record<string, T> | undefined>): Record<string, T> {
  const merged: Record<string, T> = {}
  for (const side of sides) {
    for (const [key, record] of Object.entries(side ?? {})) {
      const current = merged[key]
      if (!current || (Date.parse(record.at) || 0) >= (Date.parse(current.at) || 0)) {
        merged[key] = record
      }
    }
  }
  return merged
}

/**
 * Fold the cache one scan hands back into the one in the store.
 *
 * The two marketplaces can be scanned at the same time. Each run starts from a copy of
 * the stored cache and only ever writes entries for the sources it walked, and by the
 * time it is done the other run may well have rewritten its own. So the scan's entries
 * stand for the marketplaces it scanned, and the store's for every other — a Vinted
 * run that finishes second keeps what the Marktplaats run just learned.
 */
export function mergeCaches(stored: DealFinderCache | null, scanned: DealFinderCache, sources: readonly DealSource[]): DealFinderCache {
  const walked = new Set<string>(sources)
  const store = usableCache(stored)
  const entries: Record<string, CacheEntry> = {}
  for (const [id, entry] of Object.entries(store.entries)) {
    if (!walked.has(sourceOf(id))) {
      entries[id] = entry
    }
  }
  for (const [id, entry] of Object.entries(scanned.entries)) {
    if (walked.has(sourceOf(id))) {
      entries[id] = entry
    }
  }
  // What either run learned about a card is worth keeping, whichever marketplace it
  // was learned on; where both asked, the later answer stands.
  return {
    version: CACHE_VERSION,
    entries,
    products: newest(store.products, scanned.products),
    floors: newest(store.floors, scanned.floors),
    certs: newest(store.certs, scanned.certs),
    comps: newest(store.comps, scanned.comps)
  }
}
