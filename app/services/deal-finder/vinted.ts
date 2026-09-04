import type { SourceListing } from './types'

export const VINTED_ORIGIN = 'https://www.vinted.nl'

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

/** `9863102973-mega-ectoplasma-ex-230193` → `mega ectoplasma ex 230193` */
export function titleFromVintedSlug(slug: string): string {
  return slug.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Catalogue cards carry everything in one hover string:
 * `<title>, Merk: Pokémon, Staat: Heel goed, 196.00 €, 206.50 €`
 * (the second amount is the buyer-protection total, which we ignore).
 */
export function parseVintedHoverTitle(raw: string): { title: string; ask: number } | null {
  const trimmed = raw.trim()
  const price = trimmed.match(/,\s*([\d.,]+)\s*€,\s*[\d.,]+\s*€\s*$/)
  if (!price) {
    return null
  }

  const ask = Number(price[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  if (!Number.isFinite(ask) || ask <= 0) {
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
      // Vinted has no auctions — every catalogue item is a fixed ask.
      priceType: 'FIXED',
      imageUrls: img.src ? [img.src] : [],
      itemType: null
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
  if (!size) {
    return 0
  }
  return Number(size[1]) * Number(size[2])
}

export function parseVintedDetail(html: string): { description: string | null; imageUrls: string[] } {
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
    imageUrls: [...byImage.values()]
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

export const VINTED_CHALLENGE = /just a moment|attention required|cf-browser-verification|cf-error-details|checking your browser/i

export function isVintedChallenge(html: string): boolean {
  return VINTED_CHALLENGE.test(html) && !html.includes('product-item-id-')
}
