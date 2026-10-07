/**
 * eBay as the European market: the slabs other European sellers have up, through eBay's
 * own Browse API.
 *
 * The Browse API is free (5,000 calls a day) and allowed, but it only sees listings that
 * are live — eBay keeps sold prices behind a login and forbids reading them by machine,
 * so a deal links to the sold search instead, to be opened by hand.
 */

/** One listing as the Browse API summarises it. */
export type EbayItem = {
  itemId: string
  title: string
  price: number
  currency: string
  /** The cheapest postage to the Netherlands, or null when eBay could not say. */
  shipping: number | null
  url: string
  seller: string | null
  /** Where the item is, as a two-letter country code. */
  country: string | null
}

/** Searches eBay's European sites for a query. */
export type EbaySearch = (query: string) => Promise<EbayItem[]>

/** The eBay sites searched: each shows its own country's sellers first, and some of its neighbours'. */
export const EBAY_MARKETPLACES = ['EBAY_DE', 'EBAY_FR', 'EBAY_IT', 'EBAY_ES', 'EBAY_NL'] as const

/**
 * Sellers inside the EU. One outside it — the UK, the US, Japan — adds import VAT and
 * customs to whatever the listing says, so its price is not what a Dutch buyer pays.
 */
export const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK'
])

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
const SCOPE = 'https://api.ebay.com/oauth/api_scope'

/** eBay's category for single trading cards (CCG Individual Cards), and its condition for a graded one. */
const CCG_INDIVIDUAL_CARDS = '183454'
const GRADED = '2750'

/** Where postage is quoted to: the shop's own postcode. */
const DELIVER_TO = { country: 'NL', zip: '3562LH' }

/**
 * Graded singles at a fixed price — an auction's current bid is not a price anyone has
 * agreed to yet. A listing that also takes offers is still a fixed price.
 */
export function ebaySearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    category_ids: CCG_INDIVIDUAL_CARDS,
    filter: `conditionIds:{${GRADED}},buyingOptions:{FIXED_PRICE|BEST_OFFER}`,
    limit: '100'
  })
  return `${SEARCH_URL}?${params}`
}

/** eBay's sold listings for a query on ebay.de, the biggest of the European sites. Needs a logged-in eBay to show anything. */
export function ebaySoldSearchUrl(query: string): string {
  const params = new URLSearchParams({ _nkw: query, _sacat: CCG_INDIVIDUAL_CARDS, LH_Sold: '1', LH_Complete: '1' })
  return `https://www.ebay.de/sch/i.html?${params}`
}

function amount(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(number) && number >= 0 ? number : null
}

type Money = { value?: unknown; currency?: unknown }

type RawSummary = {
  itemId?: unknown
  title?: unknown
  price?: Money
  shippingOptions?: Array<{ shippingCost?: Money }>
  itemWebUrl?: unknown
  seller?: { username?: unknown }
  itemLocation?: { country?: unknown }
}

/** The search answer's listings, priced in euros; anything priced in another currency is left out. */
export function parseEbaySearch(payload: unknown): EbayItem[] {
  const summaries = (payload as { itemSummaries?: RawSummary[] } | null)?.itemSummaries
  if (!Array.isArray(summaries)) {
    return []
  }

  const items: EbayItem[] = []
  for (const summary of summaries) {
    const price = amount(summary.price?.value)
    const currency = typeof summary.price?.currency === 'string' ? summary.price.currency : null
    if (typeof summary.itemId !== 'string' || typeof summary.title !== 'string' || price == null || currency !== 'EUR') {
      continue
    }

    const postage = (summary.shippingOptions ?? [])
      .filter((option) => option.shippingCost?.currency == null || option.shippingCost.currency === 'EUR')
      .map((option) => amount(option.shippingCost?.value))
      .filter((value): value is number => value != null)

    items.push({
      itemId: summary.itemId,
      title: summary.title,
      price,
      currency,
      shipping: postage.length > 0 ? Math.min(...postage) : null,
      url: typeof summary.itemWebUrl === 'string' ? summary.itemWebUrl : `https://www.ebay.de/itm/${summary.itemId}`,
      seller: typeof summary.seller?.username === 'string' ? summary.seller.username : null,
      country: typeof summary.itemLocation?.country === 'string' ? summary.itemLocation.country.toUpperCase() : null
    })
  }
  return items
}

/**
 * The Browse API, signed in as the app rather than as anyone: an application token from
 * the keys in `.dev.vars`, reused until shortly before it runs out.
 *
 * Every European site is asked at once and the answers merged — a listing turns up on
 * several of them — and a site that fails costs only its own share.
 */
export function ebayBrowseSearch({
  clientId,
  clientSecret,
  request = fetch,
  marketplaces = EBAY_MARKETPLACES,
  now = () => Date.now()
}: {
  clientId: string
  clientSecret: string
  request?: typeof fetch
  marketplaces?: readonly string[]
  now?: () => number
}): EbaySearch {
  let token: { value: string; expiresAt: number } | null = null

  const accessToken = async (): Promise<string> => {
    if (token && token.expiresAt > now()) {
      return token.value
    }
    const response = await request(TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }).toString()
    })
    if (!response.ok) {
      throw new Error(`eBay refused the app keys (${response.status}).`)
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number }
    if (!body.access_token) {
      throw new Error('eBay answered without an access token.')
    }
    // A minute's margin, so a token is never sent in its last moments.
    token = { value: body.access_token, expiresAt: now() + Math.max(0, (body.expires_in ?? 7200) - 60) * 1000 }
    return token.value
  }

  return async (query) => {
    const bearer = await accessToken()
    const answers = await Promise.all(
      marketplaces.map(async (marketplace) => {
        try {
          const response = await request(ebaySearchUrl(query), {
            headers: {
              authorization: `Bearer ${bearer}`,
              'x-ebay-c-marketplace-id': marketplace,
              'x-ebay-c-enduserctx': `contextualLocation=${encodeURIComponent(`country=${DELIVER_TO.country},zip=${DELIVER_TO.zip}`)}`,
              accept: 'application/json'
            }
          })
          return response.ok ? parseEbaySearch(await response.json()) : []
        } catch {
          return []
        }
      })
    )

    const byId = new Map<string, EbayItem>()
    for (const item of answers.flat()) {
      if (!byId.has(item.itemId)) {
        byId.set(item.itemId, item)
      }
    }
    return [...byId.values()]
  }
}
