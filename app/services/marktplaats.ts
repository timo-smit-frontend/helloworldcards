import type { ProductRecord } from '../database/products'

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

/** One live ad on the shop's public Marktplaats page. */
export type MarktplaatsShopAd = {
  itemId: string
  title: string
  /** As Marktplaats prints it: `Vandaag`, `Gisteren`, `26 sep 26`. */
  date: string
  /** Marked **Gereserveerd**. */
  reserved: boolean
}

export type MarktplaatsShopPage = {
  ads: MarktplaatsShopAd[]
  /** The shop's live ads across every page, which one page may not all hold. */
  total: number
  pages: number
}

type RawShopListing = { itemId?: unknown; title?: unknown; date?: unknown; reserved?: unknown }

/**
 * The live ads on one page of the shop's public Marktplaats page (`MARKTPLAATS_URL`), read
 * from the search answer the page embeds. An ad that expired or was deleted is not on it;
 * one marked Gereserveerd is. Null when the page carries no good answer — a bot check, an
 * error, a redesign — so an ad is never taken to be gone off a page that could not be read.
 */
export function parseMarktplaatsShopPage(html: string): MarktplaatsShopPage | null {
  const json = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]
  if (!json) {
    return null
  }

  let pageProps
  try {
    pageProps = JSON.parse(json)?.props?.pageProps
  } catch {
    return null
  }
  const search = pageProps?.searchRequestAndResponse
  if (
    (pageProps.requestStatus != null && pageProps.requestStatus !== 'success') ||
    !search ||
    search.hasErrors ||
    !Array.isArray(search.listings) ||
    typeof search.totalResultCount !== 'number'
  ) {
    return null
  }

  const ads = new Map<string, MarktplaatsShopAd>()
  const listings: RawShopListing[] = [...(Array.isArray(search.topBlock) ? search.topBlock : []), ...search.listings]
  for (const listing of listings) {
    if (typeof listing?.itemId !== 'string' || typeof listing.title !== 'string') {
      continue
    }
    ads.set(listing.itemId, {
      itemId: listing.itemId,
      title: listing.title,
      date: typeof listing.date === 'string' ? listing.date : '',
      reserved: listing.reserved === true
    })
  }

  const pages = typeof search.maxAllowedPageNumber === 'number' ? search.maxAllowedPageNumber : 1
  return { ads: [...ads.values()], total: search.totalResultCount, pages }
}

/** Page `page` of the shop's public Marktplaats page, which lists thirty ads at a time. */
export function marktplaatsShopPageUrl(shopUrl: string, page: number): string {
  return page <= 1 ? shopUrl : `${shopUrl.replace(/\/?$/, '/')}p/${page}/`
}

/** `140`, `093` → `93`, `TG02` → `TG2`, `RC5`: a card number, without the zeros it is sometimes padded with. */
function cardNumberKey(value: string): string | null {
  const match = /^([a-z]*)0*(\d+)$/i.exec(value)
  return match ? `${match[1].toUpperCase()}${match[2]}` : null
}

/**
 * Whether a Marktplaats ad is this card's: the title starts with the card's name and
 * carries its number before the first dash — `Zorua AR 140/086 - BGS 9.5 - …` for Zorua
 * AR `#140`. The grade after the dash is left out, so `PSA 10` never passes for a `#10`.
 */
export function isMarktplaatsAdForCard(card: Pick<ProductRecord, 'title' | 'subtitle'>, adTitle: string): boolean {
  const name = card.title.trim().toLowerCase()
  if (!name || !adTitle.trim().toLowerCase().startsWith(`${name} `)) {
    return false
  }

  const number = /#\s*([a-z0-9]+)\s*$/i.exec(card.subtitle)?.[1]
  const key = number ? cardNumberKey(number) : null
  if (!key) {
    return false
  }
  const [head = ''] = adTitle.split(/\s[-–—]\s/)
  return head.split(/\s+/).some((token) => cardNumberKey(token.split('/')[0]) === key)
}

export type MarktplaatsCard = Pick<ProductRecord, 'id' | 'title' | 'subtitle' | 'marktplaatsUrl' | 'sold' | 'reserved' | 'concept'>

export type MarktplaatsCardAd<T extends MarktplaatsCard = MarktplaatsCard> = {
  card: T
  /**
   * `live`: its ad is on the shop page. `gone`: it links to an ad that is not, because the
   * ad expired or was deleted. `none`: it links to no ad at all.
   */
  ad: 'live' | 'gone' | 'none'
  /** For a card without a live ad: the one live ad no card links to that has its name and number — its relisted ad. */
  newAd?: MarktplaatsShopAd
}

export type MarktplaatsShopStatus<T extends MarktplaatsCard = MarktplaatsCard> = {
  /** Every card that is not sold. */
  cards: MarktplaatsCardAd<T>[]
  /** Sold cards whose ad is still up. */
  soldButLive: Array<{ card: T; ad: MarktplaatsShopAd }>
  /** Live ads no card links to that could not be paired with a card either. */
  unclaimed: MarktplaatsShopAd[]
}

/**
 * Which cards still have their Marktplaats ad up, given every live ad on the shop page.
 *
 * A card whose ad is gone is paired with a live ad no card links to only when that ad is
 * the one match for the card and the card the one match for the ad: two relists of cards
 * with the same name and number are left for a person to tell apart.
 */
export function marktplaatsShopStatus<T extends MarktplaatsCard>(cards: T[], ads: MarktplaatsShopAd[]): MarktplaatsShopStatus<T> {
  const itemIdOf = (card: MarktplaatsCard) => (card.marktplaatsUrl ? extractMarktplaatsItemId(card.marktplaatsUrl) : null)
  const live = new Map(ads.map((ad) => [ad.itemId, ad]))
  const linked = new Set(cards.map(itemIdOf))

  const rows = cards
    .filter((card) => !card.sold)
    .map((card): MarktplaatsCardAd<T> => {
      const itemId = itemIdOf(card)
      return { card, ad: itemId == null ? 'none' : live.has(itemId) ? 'live' : 'gone' }
    })

  const free = ads.filter((ad) => !linked.has(ad.itemId))
  const waiting = rows.filter((row) => row.ad !== 'live')
  for (const row of waiting) {
    const matches = free.filter((ad) => isMarktplaatsAdForCard(row.card, ad.title))
    if (matches.length === 1 && waiting.filter((other) => isMarktplaatsAdForCard(other.card, matches[0].title)).length === 1) {
      row.newAd = matches[0]
    }
  }

  const paired = new Set(rows.map((row) => row.newAd?.itemId))
  const soldButLive = cards.flatMap((card) => {
    const ad = card.sold ? live.get(itemIdOf(card) ?? '') : undefined
    return ad ? [{ card, ad }] : []
  })
  return { cards: rows, soldButLive, unclaimed: free.filter((ad) => !paired.has(ad.itemId)) }
}
