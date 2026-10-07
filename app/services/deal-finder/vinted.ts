import { decodeHtmlEntities as decodeEntities } from './entities'
import type { SourceListing } from './types'

const VINTED_ORIGIN = 'https://www.vinted.nl'

/**
 * Vinted escapes the text in its catalogue attributes twice — an apostrophe arrives as
 * `&amp;#x27;` — so one pass leaves `McDonald&#x27;s` in the title, and the second is
 * what turns it back into the words the seller typed.
 */
function tagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of tag.matchAll(/([a-zA-Z:-]+)="((?:\\.|[^"\\])*)"/g)) {
    attributes[match[1]] = decodeEntities(decodeEntities(match[2]))
  }
  return attributes
}

/** `196.00`, `1.196,50` → a number of euros, or null when it is not one. */
function euros(raw: string): number | null {
  const value = Number(raw.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** `9863102973-mega-ectoplasma-ex-230193` → `mega ectoplasma ex 230193` */
export function titleFromVintedSlug(slug: string): string {
  return slug.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The item details Vinted appends to the title in a hover string. A seller who picked
 * no brand has no `Merk:`, and the details then start at `Staat:` — which used to stay
 * on the title with both prices, so `25.00 €` was read as card number 25.
 */
const HOVER_DETAILS = /,\s*(?:Merk|Staat|Maat|Brand|Condition|Size):.*$/i

/**
 * Catalogue cards carry everything in one hover string:
 * `<title>, Merk: Pokémon, Staat: Heel goed, 196.00 €, 206.50 €`
 *
 * The first amount is what the seller asks; the second is what Vinted charges for it,
 * buyer protection included — the figure the item page prints under the price as
 * "incl. Vinted-kosten". That second one is the money that leaves your account, so
 * that is the one the scan reads.
 */
export function parseVintedHoverTitle(raw: string): { title: string; ask: number; sellerAsk: number } | null {
  const trimmed = raw.trim()
  const price = trimmed.match(/,\s*([\d.,]+)\s*€,\s*([\d.,]+)\s*€\s*$/)
  if (!price) {
    return null
  }

  const ask = euros(price[2])
  if (ask == null) {
    return null
  }

  const title = trimmed.slice(0, price.index).replace(HOVER_DETAILS, '').trim()
  // The seller's own figure is what another seller's listing competes with.
  return title ? { title, ask, sellerAsk: euros(price[1]) ?? ask } : null
}

function absoluteVintedUrl(href: string): string {
  const withoutQuery = href.split('?')[0] ?? href
  if (withoutQuery.startsWith('http')) {
    return withoutQuery
  }
  return `${VINTED_ORIGIN}${withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`}`
}

/** Vinted pages its catalogue with a `page` query parameter, counting from 1. */
export function vintedSearchPageUrl(searchUrl: string, page: number): string {
  if (/[?&]page=\d+/.test(searchUrl)) {
    return searchUrl.replace(/([?&]page=)\d+/, `$1${page}`)
  }
  return `${searchUrl}${searchUrl.includes('?') ? '&' : '?'}page=${page}`
}

export function parseVintedOverview(html: string): SourceListing[] {
  const listings: SourceListing[] = []
  const seen = new Set<string>()

  for (const match of html.matchAll(/data-testid="product-item-id-(\d+)--overlay-link"/g)) {
    const itemId = match[1]
    if (seen.has(itemId)) {
      continue
    }
    seen.add(itemId)

    const overlayTag = html.match(new RegExp(`<a[^>]*data-testid="product-item-id-${itemId}--overlay-link"[^>]*>`, 'i'))?.[0]
    const imgTag = html.match(new RegExp(`<img[^>]*data-testid="product-item-id-${itemId}--image--img"[^>]*>`, 'i'))?.[0]
    const overlay = overlayTag ? tagAttributes(overlayTag) : {}
    const img = imgTag ? tagAttributes(imgTag) : {}

    // The anchor's title attribute is sometimes clipped mid-string; the image alt is not.
    const hover = parseVintedHoverTitle(overlay.title ?? '') ?? parseVintedHoverTitle(img.alt ?? '')
    if (!hover) {
      continue
    }

    const href = overlay.href ?? `/items/${itemId}`
    const slug = href.match(/\/items\/(\d+-[^?]+)/)?.[1] ?? `${itemId}`

    listings.push({
      id: `vinted:${itemId}`,
      source: 'vinted',
      listingId: itemId,
      title: hover.title || titleFromVintedSlug(slug),
      description: null,
      ask: hover.ask,
      sellerAsk: hover.sellerAsk,
      listingUrl: absoluteVintedUrl(href),
      sellerName: null,
      sellerId: null,
      // Vinted has no auctions — every catalogue item is a fixed ask.
      priceType: 'FIXED',
      imageUrls: img.src ? [img.src] : [],
      itemType: null,
      // Only the item page quotes postage.
      shipping: null,
      listedOn: null
    })
  }

  return listings
}

/** Vinted's own human check comes in Dutch on vinted.nl: "Even geduld..." / "Verifieer dat u een mens bent". */
const VINTED_CHALLENGE =
  /just a moment|attention required|cf-browser-verification|cf-error-details|checking your browser|even geduld|verifieer dat u een mens bent|verify you are human/i

/** Vinted also bounces requests it does not trust into a `/session-refresh` page that never resolves. */
const VINTED_SESSION_REFRESH = /<title>\s*Session refresh\s*<\/title>/i

export function isVintedChallenge(html: string): boolean {
  if (html.includes('product-item-id-')) {
    return false
  }
  return VINTED_CHALLENGE.test(html) || VINTED_SESSION_REFRESH.test(html)
}
