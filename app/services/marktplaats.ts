export const MARKTPLAATS_ORIGIN = 'https://www.marktplaats.nl'

const LISTING_ITEM_ID_RE = /(?:seller\/view|plaats)\/(m\d+)/

/** Advertentienummer from a stored listing or edit URL, e.g. `m2436896724`. */
export function extractMarktplaatsItemId(marktplaatsUrl: string): string | null {
  const trimmed = marktplaatsUrl.trim()
  if (/^m\d+$/.test(trimmed)) {
    return trimmed
  }

  const match = trimmed.match(LISTING_ITEM_ID_RE)
  return match?.[1] ?? null
}

/** Seller view URL we store on products after publish. */
export function marktplaatsSellerViewUrl(itemId: string): string {
  return `${MARKTPLAATS_ORIGIN}/seller/view/${itemId}`
}

/**
 * Edit form URL derived from `marktplaatsUrl`.
 * `seller/view/m2436896724` → `https://www.marktplaats.nl/plaats/m2436896724/edit`
 */
export function marktplaatsEditUrlFromListingUrl(marktplaatsUrl: string): string | null {
  const itemId = extractMarktplaatsItemId(marktplaatsUrl)
  if (!itemId) {
    return null
  }
  return `${MARKTPLAATS_ORIGIN}/plaats/${itemId}/edit`
}
