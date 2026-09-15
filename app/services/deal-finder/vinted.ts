import type { SourceListing } from './types'

const VINTED_ORIGIN = 'https://www.vinted.nl'

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function tagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of tag.matchAll(/([a-zA-Z:-]+)="((?:\\.|[^"\\])*)"/g)) {
    attributes[match[1]] = decodeEntities(match[2])
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
 * Catalogue cards carry everything in one hover string:
 * `<title>, Merk: Pokémon, Staat: Heel goed, 196.00 €, 206.50 €`
 *
 * The first amount is what the seller asks; the second is what Vinted charges for it,
 * buyer protection included — the figure the item page prints under the price as
 * "incl. Vinted-kosten". That second one is the money that leaves your account, so
 * that is the one the scan reads.
 */
export function parseVintedHoverTitle(raw: string): { title: string; ask: number } | null {
  const trimmed = raw.trim()
  const price = trimmed.match(/,\s*[\d.,]+\s*€,\s*([\d.,]+)\s*€\s*$/)
  if (!price) {
    return null
  }

  const ask = euros(price[1])
  if (ask == null) {
    return null
  }

  const title = trimmed.replace(/,\s*Merk:.*$/i, '').trim()
  return title ? { title, ask } : null
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

const VINTED_PHOTO = /https:\/\/images\d*\.vinted\.net\/(?:t|tc)\/[^\s"'\\<>]+/g

/**
 * Catalogue thumbnails are 310x430 — too small to read a PSA label — and the URL
 * signature is bound to the size, so the full-size photos have to come off the item page.
 */
export function vintedPhotoArea(url: string): number {
  const size = url.match(/\/(\d{2,4})x(\d{2,4})\//)
  if (size) {
    return Number(size[1]) * Number(size[2])
  }
  // The full-size photo is named by its width alone (`/f800/`) and is the one the
  // label reader needs, so score it as a square of that width rather than as zero.
  const full = url.match(/\/f(\d{2,4})\//)
  return full ? Number(full[1]) * Number(full[1]) : 0
}

/**
 * The item page lists postage separately from the price, as the cheapest option it can
 * offer: `data-testid="item-shipping-banner-price">vanaf € 2,99`. It is not in the
 * catalogue row, so it is only known once the listing itself has been read.
 */
const SHIPPING_PRICE = /data-testid="item-shipping-banner-price"[^>]*>[^€<]*€\s*([\d.,]+)/i

export function vintedShipping(html: string): number | null {
  const raw = html.match(SHIPPING_PRICE)?.[1]
  return raw ? euros(decodeEntities(raw)) : null
}

/**
 * How many reviews the seller has, as the item page prints it in the seller box.
 *
 * A reviewed seller gets a star rating with the count in brackets after it; one without
 * any gets the caption "Nog geen beoordelingen" instead. The item JSON the page ships
 * with carries the same figure as `feedback_count`, and is read first because it does
 * not depend on the page's language. Null when none of that is on the page — an item
 * page that did not render its seller box is not held against the seller.
 */
const FEEDBACK_COUNT = /"feedback_?[cC]ount"\s*:\s*(\d+)/
const NO_REVIEWS_YET = /(?:nog\s+)?geen\s+beoordelingen|no\s+reviews\s+yet|noch\s+keine\s+bewertungen/i
const RATING_COUNT = /web_ui__Rating__label[^>]*>\s*\(?\s*(\d+)\s*\)?\s*</i

export function vintedSellerReviews(html: string): number | null {
  const embedded = html.match(FEEDBACK_COUNT)?.[1]
  if (embedded != null) {
    return Number(embedded)
  }
  if (NO_REVIEWS_YET.test(html)) {
    return 0
  }
  const printed = html.match(RATING_COUNT)?.[1]
  return printed != null ? Number(printed) : null
}

export function parseVintedDetail(html: string): {
  description: string | null
  imageUrls: string[]
  shipping: number | null
  sellerReviews: number | null
} {
  const byImage = new Map<string, string>()
  for (const match of html.matchAll(VINTED_PHOTO)) {
    const url = decodeEntities(match[0])
    // Same photo, several sizes — key on the file name and keep the biggest.
    const key = url.split('/').pop()?.split('?')[0] ?? url
    const current = byImage.get(key)
    if (!current || vintedPhotoArea(url) > vintedPhotoArea(current)) {
      byImage.set(key, url)
    }
  }

  return {
    description: detailDescription(html),
    imageUrls: [...byImage.values()],
    shipping: vintedShipping(html),
    sellerReviews: vintedSellerReviews(html)
  }
}

function tidy(value: string): string {
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|span)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(decodeEntities(text))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const DESCRIPTION_BLOCKS = [
  /<div[^>]+itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
  /<div[^>]+data-testid="item-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  /<span[^>]+class="[^"]*item-description[^"]*"[^>]*>([\s\S]*?)<\/span>/i
]

function detailDescription(html: string): string | null {
  for (const pattern of DESCRIPTION_BLOCKS) {
    const block = html.match(pattern)?.[1]
    if (block) {
      const text = tidy(block)
      if (text.length > 0) {
        return text
      }
    }
  }

  const meta = html.match(/<meta[^>]+(?:name|property)="(?:og:)?description"[^>]*content="([^"]*)"/i)?.[1]
  return meta ? tidy(meta) : null
}

const VINTED_CHALLENGE = /just a moment|attention required|cf-browser-verification|cf-error-details|checking your browser/i

/** Vinted also bounces requests it does not trust into a `/session-refresh` page that never resolves. */
const VINTED_SESSION_REFRESH = /<title>\s*Session refresh\s*<\/title>/i

export function isVintedChallenge(html: string): boolean {
  if (html.includes('product-item-id-')) {
    return false
  }
  return VINTED_CHALLENGE.test(html) || VINTED_SESSION_REFRESH.test(html)
}
