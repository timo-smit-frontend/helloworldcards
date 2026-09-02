import { MARKTPLAATS_ORIGIN } from '../marktplaats'

export type MarktplaatsOverviewListing = {
  title: string
  ask: number
  marktplaatsUrl: string
  sellerName: string | null
  priceType: string
  /** First listing photo (prefer large), used to OCR the PSA label. */
  imageUrl: string | null
}

type RawListing = {
  title?: string
  vipUrl?: string
  priceInfo?: {
    priceCents?: number
    priceType?: string
  }
  sellerInformation?: {
    sellerName?: string
  }
  pictures?: Array<{
    largeUrl?: string
    mediumUrl?: string
    extraExtraLargeUrl?: string
    url?: string
  }>
  imageUrls?: string[]
}

function firstListingImageUrl(item: RawListing): string | null {
  const picture =
    item.pictures?.[0]?.extraExtraLargeUrl ??
    item.pictures?.[0]?.largeUrl ??
    item.pictures?.[0]?.mediumUrl ??
    item.pictures?.[0]?.url
  if (picture) {
    return picture.replace('$_#.', '$_85.')
  }

  const raw = item.imageUrls?.[0]
  if (!raw) {
    return null
  }
  const withScheme = raw.startsWith('//') ? `https:${raw}` : raw
  return withScheme.replace('$_82.', '$_85.').replace('$_14.', '$_85.')
}

export function parseMarktplaatsOverview(html: string): MarktplaatsOverviewListing[] {
  const marker = '"listings":['
  const start = html.indexOf(marker)
  if (start === -1) {
    return []
  }

  const arrayStart = html.indexOf('[', start + marker.length - 1)
  if (arrayStart === -1) {
    return []
  }

  let depth = 0
  let arrayEnd = -1
  for (let index = arrayStart; index < html.length; index += 1) {
    const char = html[index]
    if (char === '[') {
      depth += 1
    } else if (char === ']') {
      depth -= 1
      if (depth === 0) {
        arrayEnd = index
        break
      }
    }
  }

  if (arrayEnd === -1) {
    return []
  }

  let raw: RawListing[]
  try {
    raw = JSON.parse(html.slice(arrayStart, arrayEnd + 1)) as RawListing[]
  } catch {
    return []
  }

  const listings: MarktplaatsOverviewListing[] = []
  for (const item of raw) {
    const title = item.title?.trim()
    const vipUrl = item.vipUrl?.trim()
    const priceCents = item.priceInfo?.priceCents
    const priceType = item.priceInfo?.priceType ?? ''
    if (!title || !vipUrl || priceCents == null || priceCents <= 0) {
      continue
    }

    listings.push({
      title,
      ask: priceCents / 100,
      marktplaatsUrl: vipUrl.startsWith('http') ? vipUrl : `${MARKTPLAATS_ORIGIN}${vipUrl}`,
      sellerName: item.sellerInformation?.sellerName?.trim() ?? null,
      priceType,
      imageUrl: firstListingImageUrl(item)
    })
  }

  return listings
}

export const MARKTPLAATS_CHALLENGE =
  /even geduld|just a moment|attention required|beveiliging wordt geverifieerd|cf-browser-verification|cf-error-details|checking your browser/i

export function isMarktplaatsChallenge(html: string): boolean {
  return MARKTPLAATS_CHALLENGE.test(html)
}
