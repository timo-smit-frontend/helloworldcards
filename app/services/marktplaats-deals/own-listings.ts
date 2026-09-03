/** Our Marktplaats seller-view URL is `.../seller/view/m2436738700`; the public
 *  overview scrape links are `.../v/{category}/m2436738700-title-slug` — same
 *  numeric ad id either way. */
const MARKTPLAATS_ID_RE = /\bm(\d{6,})\b/i
/** Our stored `vintedUrl` is `.../items/9878773873`; the overview scrape links
 *  are `.../items/9878773873-title-slug` — same numeric item id either way. */
const VINTED_ID_RE = /\/items\/(\d+)/

export type OwnListingRef = { marktplaatsUrl?: string | null; vintedUrl?: string | null }
export type OwnListingIds = { marktplaats: Set<string>; vinted: Set<string> }

export function extractMarktplaatsListingId(url: string | null | undefined): string | null {
  return url ? (url.match(MARKTPLAATS_ID_RE)?.[1] ?? null) : null
}

export function extractVintedListingId(url: string | null | undefined): string | null {
  return url ? (url.match(VINTED_ID_RE)?.[1] ?? null) : null
}

/** Item ids from our own inventory's `marktplaatsUrl` / `vintedUrl`, so the deal scan can
 *  skip our own listings instead of reporting them as (mismatched) buy candidates. */
export function ownListingIds(products: OwnListingRef[]): OwnListingIds {
  const marktplaats = new Set<string>()
  const vinted = new Set<string>()
  for (const product of products) {
    const mpId = extractMarktplaatsListingId(product.marktplaatsUrl)
    if (mpId) {
      marktplaats.add(mpId)
    }
    const vId = extractVintedListingId(product.vintedUrl)
    if (vId) {
      vinted.add(vId)
    }
  }
  return { marktplaats, vinted }
}

export function isOwnListing(listingUrl: string, source: 'marktplaats' | 'vinted', ids: OwnListingIds): boolean {
  if (source === 'marktplaats') {
    const id = extractMarktplaatsListingId(listingUrl)
    return id != null && ids.marktplaats.has(id)
  }
  const id = extractVintedListingId(listingUrl)
  return id != null && ids.vinted.has(id)
}

/** Drop our own store's listings from a scanned overview before they're evaluated as deals. */
export function splitOwnListings<T extends { title: string; ask: number; marktplaatsUrl: string }>(
  listings: T[],
  source: 'marktplaats' | 'vinted',
  ids: OwnListingIds
): { kept: T[]; skipped: Array<{ title: string; ask: number; reason: string }> } {
  const kept: T[] = []
  const skipped: Array<{ title: string; ask: number; reason: string }> = []
  for (const listing of listings) {
    if (isOwnListing(listing.marktplaatsUrl, source, ids)) {
      skipped.push({ title: listing.title, ask: listing.ask, reason: 'Our own listing' })
      continue
    }
    kept.push(listing)
  }
  return { kept, skipped }
}
