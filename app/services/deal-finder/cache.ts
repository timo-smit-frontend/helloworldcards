import type { MarketListing } from '../cardmarket/grades'
import { IDENTITY_TTL_MS, PRICE_TTL_MS } from './constants'
import type { CardIdentity, PsaLabel } from './types'

/**
 * What we already know about one listing. Identifying a card costs a photo read,
 * a Google search and a Cardmarket page load, and none of that changes once a
 * listing is up — so it is remembered and only the price is refreshed.
 */
export type CacheEntry = {
  id: string
  ask: number
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
  /** Why this listing could not be checked; a cached problem is always retried. */
  problem: { stage: 'listing' | 'identify' | 'match' | 'price'; reason: string; detail: string | null } | null
}

export type DealFinderCache = { entries: Record<string, CacheEntry> }

export type DealFinderCacheStore = {
  getCache(): Promise<DealFinderCache | null>
  putCache(cache: DealFinderCache): Promise<void>
}

export function emptyCache(): DealFinderCache {
  return { entries: {} }
}

function ageMs(iso: string | null, now: Date): number {
  if (!iso) {
    return Number.POSITIVE_INFINITY
  }
  const at = Date.parse(iso)
  return Number.isFinite(at) ? now.getTime() - at : Number.POSITIVE_INFINITY
}

/** A remembered card identity is reusable for a month — the listing still shows the same slab. */
export function hasFreshIdentity(entry: CacheEntry | undefined, now: Date): entry is CacheEntry {
  if (!entry || entry.problem || !entry.identity) {
    return false
  }
  return ageMs(entry.identifiedAt, now) < IDENTITY_TTL_MS
}

/** A remembered Cardmarket floor is only reused for half a day, and only at the same ask. */
export function hasFreshPrice(entry: CacheEntry | undefined, now: Date, ask: number): entry is CacheEntry {
  if (!hasFreshIdentity(entry, now) || entry.floor == null || entry.ask !== ask) {
    return false
  }
  return ageMs(entry.pricedAt, now) < PRICE_TTL_MS
}

/** Forget listings that were not in this scan, so the cache tracks the live feed. */
export function pruneCache(cache: DealFinderCache, liveIds: Set<string>): DealFinderCache {
  const entries: Record<string, CacheEntry> = {}
  for (const [id, entry] of Object.entries(cache.entries)) {
    if (liveIds.has(id)) {
      entries[id] = entry
    }
  }
  return { entries }
}
