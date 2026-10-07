import { describe, expect, it, vi } from 'vitest'
import { ebayBrowseSearch, ebaySearchUrl, ebaySoldSearchUrl, parseEbaySearch } from '~/services/deal-finder/ebay'

const SEARCH_ANSWER = {
  total: 3,
  itemSummaries: [
    {
      itemId: 'v1|1|0',
      title: 'PSA 10 Umbreon VMAX 215/203',
      price: { value: '480.00', currency: 'EUR' },
      shippingOptions: [
        { shippingCostType: 'FIXED', shippingCost: { value: '15.00', currency: 'EUR' } },
        { shippingCostType: 'FIXED', shippingCost: { value: '9.90', currency: 'EUR' } }
      ],
      itemWebUrl: 'https://www.ebay.de/itm/1',
      seller: { username: 'kartenladen', feedbackPercentage: '100.0', feedbackScore: 812 },
      itemLocation: { country: 'DE' }
    },
    {
      itemId: 'v1|2|0',
      title: 'PSA 10 Umbreon VMAX 215/203',
      price: { value: '400.00', currency: 'GBP' },
      itemLocation: { country: 'GB' }
    },
    {
      itemId: 'v1|3|0',
      title: 'PSA 10 Umbreon VMAX 215/203',
      price: { value: '499.00', currency: 'EUR' },
      itemLocation: { country: 'fr' }
    }
  ]
}

describe('parseEbaySearch', () => {
  it('reads each listing in euros with its cheapest postage, and leaves other currencies out', () => {
    expect(parseEbaySearch(SEARCH_ANSWER)).toEqual([
      {
        itemId: 'v1|1|0',
        title: 'PSA 10 Umbreon VMAX 215/203',
        price: 480,
        currency: 'EUR',
        shipping: 9.9,
        url: 'https://www.ebay.de/itm/1',
        seller: 'kartenladen',
        country: 'DE'
      },
      {
        itemId: 'v1|3|0',
        title: 'PSA 10 Umbreon VMAX 215/203',
        price: 499,
        currency: 'EUR',
        shipping: null,
        url: 'https://www.ebay.de/itm/v1|3|0',
        seller: null,
        country: 'FR'
      }
    ])
  })

  it('answers nothing for an answer without listings', () => {
    expect(parseEbaySearch({ total: 0 })).toEqual([])
    expect(parseEbaySearch(null)).toEqual([])
  })
})

describe('the eBay URLs', () => {
  it('searches graded single cards at a fixed price', () => {
    const url = new URL(ebaySearchUrl('Umbreon 215 PSA 10'))
    expect(url.origin + url.pathname).toBe('https://api.ebay.com/buy/browse/v1/item_summary/search')
    expect(url.searchParams.get('q')).toBe('Umbreon 215 PSA 10')
    expect(url.searchParams.get('category_ids')).toBe('183454')
    expect(url.searchParams.get('filter')).toBe('conditionIds:{2750},buyingOptions:{FIXED_PRICE|BEST_OFFER}')
  })

  it('links the sold listings on ebay.de, to be opened by hand', () => {
    const url = new URL(ebaySoldSearchUrl('Umbreon 215 PSA 10'))
    expect(url.hostname).toBe('www.ebay.de')
    expect(url.searchParams.get('LH_Sold')).toBe('1')
    expect(url.searchParams.get('_nkw')).toBe('Umbreon 215 PSA 10')
  })
})

describe('ebayBrowseSearch', () => {
  function fakeEbay() {
    const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url)
      if (target.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'app-token', expires_in: 7200 }), { status: 200 })
      }
      const marketplace = new Headers(init?.headers).get('x-ebay-c-marketplace-id')
      if (marketplace === 'EBAY_IT') {
        return new Response('nope', { status: 500 })
      }
      return new Response(JSON.stringify(SEARCH_ANSWER), { status: 200 })
    })
    return request
  }

  it('signs in as the app once, asks every European site, and merges what they answer', async () => {
    const request = fakeEbay()
    const search = ebayBrowseSearch({ clientId: 'id', clientSecret: 'secret', request: request as unknown as typeof fetch })

    const first = await search('Umbreon 215 PSA 10')
    await search('Pikachu 25 PSA 10')

    // The same two euro listings, whichever sites listed them; the failing site cost only its own share.
    expect(first.map((item) => item.itemId)).toEqual(['v1|1|0', 'v1|3|0'])
    const tokenCalls = request.mock.calls.filter(([url]) => String(url).includes('/oauth2/token'))
    expect(tokenCalls).toHaveLength(1)
    const [, tokenInit] = tokenCalls[0]!
    expect(new Headers(tokenInit?.headers).get('authorization')).toBe(`Basic ${btoa('id:secret')}`)

    const searchInit = request.mock.calls.find(([url]) => String(url).includes('/item_summary/search'))?.[1]
    expect(new Headers(searchInit?.headers).get('authorization')).toBe('Bearer app-token')
    expect(new Headers(searchInit?.headers).get('x-ebay-c-enduserctx')).toBe('contextualLocation=country%3DNL%2Czip%3D3562LH')
  })

  it('says so when eBay refuses the keys', async () => {
    const request = vi.fn(async () => new Response('unauthorized', { status: 401 }))
    const search = ebayBrowseSearch({ clientId: 'id', clientSecret: 'wrong', request: request as unknown as typeof fetch })
    await expect(search('Umbreon 215 PSA 10')).rejects.toThrow('eBay refused the app keys (401).')
  })
})
