import type { DealSource, SourceListing } from './types'

/** A listing a scan saw on a search page, kept so later scans can price against it. */
export type RememberedListing = {
  id: string
  source: DealSource
  title: string
  /** What the buyer pays, as the search page printed it. */
  ask: number
  /** What the seller asks, before the site's buyer fees. */
  sellerAsk: number
  url: string
  firstSeen: string
  lastSeen: string
}

/**
 * Everything the scans have seen, between scans.
 *
 * Vinted is never searched for a card — every request there counts against a limit that
 * blocks the whole computer — so the only Vinted competition a card has is what the scans
 * already read on their way through the newest listings. Kept here, a month of that adds
 * up to a fair picture of what Vinted sellers ask. It is a store on the dev machine, so the
 * scan only knows it through this shape.
 */
export type MarketMemory = {
  /** Note every listing on a search page — in scope or not, it may be someone's competition later. */
  remember(listings: SourceListing[], seenAt: string): Promise<void>
  /** Listings from one source seen since a moment. */
  seenSince(source: DealSource, since: string): Promise<RememberedListing[]>
}

export function rememberedFrom(listing: SourceListing, seenAt: string): RememberedListing {
  return {
    id: listing.id,
    source: listing.source,
    title: listing.title,
    ask: listing.ask,
    sellerAsk: listing.sellerAsk ?? listing.ask,
    url: listing.listingUrl,
    firstSeen: seenAt,
    lastSeen: seenAt
  }
}

/** The same thing held in a map — for tests, and for a dev server that cannot open the database. */
export function inMemoryMarketMemory(seed: RememberedListing[] = []): MarketMemory {
  const rows = new Map(seed.map((row) => [row.id, row]))
  return {
    async remember(listings, seenAt) {
      for (const listing of listings) {
        const known = rows.get(listing.id)
        const fresh = rememberedFrom(listing, seenAt)
        rows.set(listing.id, known ? { ...fresh, firstSeen: known.firstSeen } : fresh)
      }
    },
    async seenSince(source, since) {
      const from = Date.parse(since)
      return [...rows.values()].filter((row) => row.source === source && Date.parse(row.lastSeen) >= from)
    }
  }
}
