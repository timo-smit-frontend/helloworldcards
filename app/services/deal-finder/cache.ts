import type { MarketListing } from '../cardmarket/grades'
import { IDENTITY_TTL_MS, PRICE_TTL_MS, VERDICT_TTL_MS } from './constants'
import type { CardIdentity, DealSource, PsaLabel } from './types'

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
 */
export const CACHE_VERSION = 3

export type DealFinderCache = { version?: number; entries: Record<string, CacheEntry> }

/** The cache to start from: the stored one, or a fresh one when older logic wrote it. */
export function usableCache(stored: DealFinderCache | null | undefined): DealFinderCache {
  return stored && stored.version === CACHE_VERSION ? { version: CACHE_VERSION, entries: { ...stored.entries } } : emptyCache()
}

export type DealFinderCacheStore = {
  getCache(): Promise<DealFinderCache | null>
  putCache(cache: DealFinderCache): Promise<void>
}

export function emptyCache(): DealFinderCache {
  return { version: CACHE_VERSION, entries: {} }
}

function ageMs(iso: string | null, now: Date): number {
  if (!iso) {
    return Number.POSITIVE_INFINITY
  }
  const at = Date.parse(iso)
  return Number.isFinite(at) ? now.getTime() - at : Number.POSITIVE_INFINITY
}

/** A remembered card identity is reusable for a month — the listing still shows the same slab. */
export function hasFreshIdentity(entry: CacheEntry | undefined, now: Date): boolean {
  if (!entry || entry.problem || !entry.identity) {
    return false
  }
  return ageMs(entry.identifiedAt, now) < IDENTITY_TTL_MS
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
 * Two of these: the photos were read and the slab is not a PSA 9/10 single we buy, and the
 * card was worked out but no Cardmarket page matched it. Both are readings of a listing that
 * is not going to change, so they are answered from here rather than re-read.
 *
 * A Cardmarket bot check or a page that would not load is deliberately not one of them —
 * that is the scan having a bad moment, not a fact about the listing — and neither is a
 * `listing` stage failure, which is decided before the cache is ever consulted.
 */
function isSettled(entry: CacheEntry): boolean {
  if (!entry.problem) {
    return entry.identity == null
  }
  return entry.problem.stage === 'identify' || entry.problem.stage === 'match'
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
export function pruneCache(cache: DealFinderCache, liveIds: Set<string>, sources: readonly DealSource[]): DealFinderCache {
  const scanned = new Set<string>(sources)
  const entries: Record<string, CacheEntry> = {}
  for (const [id, entry] of Object.entries(cache.entries)) {
    if (liveIds.has(id) || !scanned.has(sourceOf(id))) {
      entries[id] = entry
    }
  }
  return { version: CACHE_VERSION, entries }
}
