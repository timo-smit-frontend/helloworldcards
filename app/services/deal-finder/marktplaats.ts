import { MARKTPLAATS_ORIGIN } from '../marktplaats'
import type { SourceListing } from './types'

/**
 * Marktplaats serves every photo through one URL with a `$_<size>.` token.
 * `86` (XXXL) is the largest size that stays a sensible upload for the label reader.
 */
const PHOTO_SIZE = '86'

export function marktplaatsPhotoUrl(raw: string): string {
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw
  return absolute.replace(/\$_(?:#|\d{1,2})\./, `$_${PHOTO_SIZE}.`)
}

type RawPicture = {
  url?: string
  largeUrl?: string
  mediumUrl?: string
  extraExtraLargeUrl?: string
}

type RawListing = {
  itemId?: string
  title?: string
  description?: string
  categorySpecificDescription?: string
  vipUrl?: string
  priceInfo?: { priceCents?: number; priceType?: string }
  sellerInformation?: { sellerName?: string }
  pictures?: RawPicture[]
  imageUrls?: string[]
  extendedAttributes?: Array<{ key?: string; value?: string }>
  attributes?: Array<{ key?: string; value?: string }>
}

/** Walk from the first `[` and return the balanced array text, so nested objects survive. */
function balancedArray(html: string, from: number): string | null {
  const start = html.indexOf('[', from)
  if (start === -1) {
    return null
  }

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '[') {
      depth += 1
    } else if (char === ']') {
      depth -= 1
      if (depth === 0) {
        return html.slice(start, index + 1)
      }
    }
  }

  return null
}

function listingPhotos(item: RawListing): string[] {
  const fromPictures = (item.pictures ?? [])
    .map((picture) => picture.extraExtraLargeUrl ?? picture.largeUrl ?? picture.url ?? picture.mediumUrl)
    .filter((url): url is string => Boolean(url))
  const photos = fromPictures.length > 0 ? fromPictures : (item.imageUrls ?? [])
  return [...new Set(photos.map(marktplaatsPhotoUrl))]
}

function attributeValue(item: RawListing, key: string): string | null {
  const attributes = [...(item.extendedAttributes ?? []), ...(item.attributes ?? [])]
  return attributes.find((attribute) => attribute.key === key)?.value?.trim() ?? null
}

export function parseMarktplaatsOverview(html: string): SourceListing[] {
  const marker = html.indexOf('"listings":[')
  if (marker === -1) {
    return []
  }

  const arrayText = balancedArray(html, marker + '"listings":'.length - 1)
  if (!arrayText) {
    return []
  }

  let raw: RawListing[]
  try {
    raw = JSON.parse(arrayText) as RawListing[]
  } catch {
    return []
  }

  const listings: SourceListing[] = []
  for (const item of raw) {
    const title = item.title?.trim()
    const vipUrl = item.vipUrl?.trim()
    const priceCents = item.priceInfo?.priceCents
    if (!title || !vipUrl || priceCents == null || priceCents <= 0) {
      continue
    }

    const listingId = item.itemId?.trim() || (vipUrl.match(/\/([am]\d{6,})-/)?.[1] ?? vipUrl)
    listings.push({
      id: `marktplaats:${listingId}`,
      source: 'marktplaats',
      listingId,
      title,
      description: (item.description ?? item.categorySpecificDescription)?.trim() || null,
      ask: priceCents / 100,
      listingUrl: vipUrl.startsWith('http') ? vipUrl : `${MARKTPLAATS_ORIGIN}${vipUrl}`,
      sellerName: item.sellerInformation?.sellerName?.trim() ?? null,
      priceType: item.priceInfo?.priceType ?? '',
      imageUrls: listingPhotos(item),
      itemType: attributeValue(item, 'type')
    })
  }

  return listings
}

/**
 * The listing page carries every photo in `window.__CONFIG__`, but renders the full
 * description client-side — so the description only appears once the page has run.
 */
export function parseMarktplaatsDetail(html: string): { description: string | null; imageUrls: string[] } {
  return {
    description: detailDescription(html),
    imageUrls: detailPhotos(html)
  }
}

function detailPhotos(html: string): string[] {
  const marker = html.indexOf('"imageUrls":[')
  if (marker === -1) {
    return []
  }

  const arrayText = balancedArray(html, marker + '"imageUrls":'.length - 1)
  if (!arrayText) {
    return []
  }

  try {
    const urls = JSON.parse(arrayText) as string[]
    return [...new Set(urls.filter((url) => typeof url === 'string').map(marktplaatsPhotoUrl))]
  } catch {
    return []
  }
}

function stripTags(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function tidy(value: string): string {
  return decodeEntities(stripTags(value))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Marktplaats has renamed this block more than once, so try the known hooks in
 * order and fall back to the (truncated) meta description rather than nothing.
 */
const DESCRIPTION_BLOCKS = [
  /<div[^>]+data-testid="(?:listing-)?description"[^>]*>([\s\S]*?)<\/div>/i,
  /<div[^>]+class="[^"]*Description-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  /<div[^>]+id="vip-ad-description"[^>]*>([\s\S]*?)<\/div>/i
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

  const meta = html.match(/<meta name="description" content="([^"]*)"/i)?.[1]
  return meta ? tidy(meta) : null
}

export const MARKTPLAATS_CHALLENGE =
  /even geduld|just a moment|attention required|beveiliging wordt geverifieerd|cf-browser-verification|cf-error-details|checking your browser/i

export function isMarktplaatsChallenge(html: string): boolean {
  return MARKTPLAATS_CHALLENGE.test(html)
}
