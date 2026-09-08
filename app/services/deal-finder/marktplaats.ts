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
  sellerInformation?: { sellerName?: string; sellerId?: number | string }
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

/** Marktplaats' own search endpoint, which answers with the same `listings` payload the page embeds. */
export const MARKTPLAATS_SEARCH_API = 'https://www.marktplaats.nl/lrp/api/search'

/** The most listings the search endpoint will serve in one answer; asking for more is a 400. */
export const MARKTPLAATS_PAGE_SIZE = 100

export function isMarktplaatsSearchApi(url: string): boolean {
  return url.startsWith(MARKTPLAATS_SEARCH_API)
}

/** Fragment filters that are parameters in their own right rather than card attributes. */
const NAMED_FILTERS = new Set(['postcode', 'distanceMeters'])

/**
 * Fragment entries that never become a request parameter: `view` only changes how the
 * page looks, and the sort is fixed below rather than taken from the browse URL.
 */
const IGNORED_FILTERS = new Set(['view', 'sortBy', 'sortOrder'])

/**
 * Newest first, and never Marktplaats' own relevance ranking: asking for `SORT_INDEX`
 * quietly caps the search at its first hundred results, so a day with a hundred and
 * twelve Pokémon slabs in it comes back a hundred long with no sign that the rest exist.
 */
const SORT = { sortBy: 'SORT_DATE', sortOrder: 'DECREASING' }

/** `PriceCentsFrom:1000` and `PriceCentsTo:20000` are the two ends of one range parameter. */
const PRICE_BOUND = /^PriceCents(From|To)$/

/**
 * Turn a Marktplaats browse URL into a request for one page of its results.
 *
 * Marktplaats keeps every filter in the URL fragment — `#offeredSince:Vandaag|PriceCentsTo:20000`
 * — and applies it in the browser. A fragment is never sent to the server, so the HTML
 * behind that URL is the whole unfiltered search: fourteen thousand listings for
 * `pokemon psa`, ranked by relevance rather than by date, with none of the filters and
 * none of the sorting. Paging through that just walks further into every Pokémon slab
 * ever listed, which is precisely what it did.
 *
 * The search endpoint takes the same filters as real parameters and answers with the
 * `{"listings":[…]}` payload the overview parser already reads, so the scan asks it
 * directly and the browse URL stays the thing a human clicks.
 */
export function marktplaatsSearchPageUrl(searchUrl: string, page: number): string {
  const [path = '', fragment = ''] = searchUrl.split('#')
  const query = decodeURIComponent(path.match(/\/q\/([^/?#]+)/)?.[1] ?? '').replace(/\+/g, ' ')

  const params = new URLSearchParams({
    limit: String(MARKTPLAATS_PAGE_SIZE),
    offset: String(Math.max(0, page - 1) * MARKTPLAATS_PAGE_SIZE),
    ...SORT
  })
  if (query) {
    params.set('query', query)
  }

  let priceFrom = ''
  let priceTo = ''
  for (const filter of fragment.split('|')) {
    const at = filter.indexOf(':')
    if (at === -1) {
      continue
    }
    const key = filter.slice(0, at)
    const value = decodeURIComponent(filter.slice(at + 1))
    const bound = key.match(PRICE_BOUND)

    if (bound) {
      if (bound[1] === 'From') {
        priceFrom = value
      } else {
        priceTo = value
      }
    } else if (NAMED_FILTERS.has(key)) {
      params.set(key, value)
    } else if (!IGNORED_FILTERS.has(key)) {
      params.append('attributesByKey[]', `${key}:${value}`)
    }
  }

  if (priceFrom || priceTo) {
    params.append('attributeRanges[]', `PriceCents:${priceFrom}:${priceTo}`)
  }

  return `${MARKTPLAATS_SEARCH_API}?${params}`
}

/** How many listings Marktplaats says match the search, whatever page we asked for. */
export function marktplaatsResultCount(payload: string): number | null {
  const match = payload.match(/"totalResultCount"\s*:\s*(\d+)/)
  return match ? Number(match[1]) : null
}

/**
 * Marktplaats refuses to page past the first 300 listings of a search and says so at the
 * foot of the results. Everything after that is invisible to us, so a search broad enough
 * to hit it has to be reported rather than answered with a partial list.
 */
export const MARKTPLAATS_RESULT_CAP = /(?:we (?:only )?show|we tonen(?:\s+alleen)?)[^.]{0,30}\b(?:first|eerste)\s+300\b/i

export function isMarktplaatsResultCap(payload: string): boolean {
  return MARKTPLAATS_RESULT_CAP.test(payload)
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
      sellerId: item.sellerInformation?.sellerId != null ? String(item.sellerInformation.sellerId) : null,
      priceType: item.priceInfo?.priceType ?? '',
      imageUrls: listingPhotos(item),
      itemType: attributeValue(item, 'type'),
      // Marktplaats never quotes postage on a listing, so it is always the flat estimate.
      shipping: null
    })
  }

  return listings
}

/**
 * The listing page carries every photo in `window.__CONFIG__`, but renders the full
 * description client-side — so the description only appears once the page has run.
 */
export function parseMarktplaatsDetail(html: string): { description: string | null; imageUrls: string[]; shipping: number | null } {
  return {
    description: detailDescription(html),
    imageUrls: detailPhotos(html),
    shipping: null
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


/**
 * Where Marktplaats keeps a seller's review count. The listing feed does not carry it
 * and the listing page only links to it, but this endpoint answers plain JSON keyed on
 * the very `sellerId` the feed already gave us.
 */
export function marktplaatsSellerProfileUrl(sellerId: string): string {
  return `${MARKTPLAATS_ORIGIN}/v/api/seller-profile/${encodeURIComponent(sellerId)}`
}

/** How many reviews a seller profile reports, or null when the answer made no sense. */
export function parseSellerReviews(json: string): number | null {
  try {
    const parsed = JSON.parse(json) as { reviews?: Array<{ numberOfReviews?: unknown }> }
    const counts = (parsed.reviews ?? []).map((entry) => Number(entry.numberOfReviews)).filter((count) => Number.isFinite(count))
    return counts.length > 0 ? Math.max(...counts) : 0
  } catch {
    return null
  }
}
