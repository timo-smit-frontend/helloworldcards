import { describe, expect, it } from 'vitest'
import {
  extractMarktplaatsItemId,
  isMarktplaatsAdForCard,
  marktplaatsEditUrlFromListingUrl,
  marktplaatsSellerViewUrl,
  marktplaatsShopPageUrl,
  marktplaatsShopStatus,
  parseMarktplaatsShopPage,
  type MarktplaatsCard,
  type MarktplaatsShopAd
} from '../app/services/marktplaats'

describe('extractMarktplaatsItemId', () => {
  it('reads item ids from seller view URLs', () => {
    expect(extractMarktplaatsItemId('https://www.marktplaats.nl/seller/view/m2436896724')).toBe('m2436896724')
    expect(extractMarktplaatsItemId('https://www.marktplaats.nl/seller/view/m2436737465')).toBe('m2436737465')
  })

  it('reads item ids from edit URLs', () => {
    expect(extractMarktplaatsItemId('https://www.marktplaats.nl/plaats/m2436896724/edit')).toBe('m2436896724')
  })

  it('accepts a bare item id', () => {
    expect(extractMarktplaatsItemId('m2436896724')).toBe('m2436896724')
  })

  it('returns null for unrelated URLs', () => {
    expect(extractMarktplaatsItemId('https://www.marktplaats.nl/u/hello-world-cards/25399885/')).toBeNull()
    expect(extractMarktplaatsItemId('')).toBeNull()
  })
})

describe('marktplaatsEditUrlFromListingUrl', () => {
  it('maps seller view URLs to edit URLs', () => {
    expect(marktplaatsEditUrlFromListingUrl('https://www.marktplaats.nl/seller/view/m2436896724')).toBe(
      'https://www.marktplaats.nl/plaats/m2436896724/edit'
    )
    expect(marktplaatsEditUrlFromListingUrl('https://www.marktplaats.nl/seller/view/m2436737465')).toBe(
      'https://www.marktplaats.nl/plaats/m2436737465/edit'
    )
  })
})

describe('marktplaatsSellerViewUrl', () => {
  it('builds the stored listing URL', () => {
    expect(marktplaatsSellerViewUrl('m2436896724')).toBe('https://www.marktplaats.nl/seller/view/m2436896724')
  })
})

const SHOP_URL = 'https://www.marktplaats.nl/u/hello-world-cards/25399885/'

/** The shop page as Marktplaats serves it: the search answer sits in the Next.js data script. */
function shopPage(search: Record<string, unknown>, pageProps: Record<string, unknown> = {}): string {
  const listings = (search.listings as unknown[] | undefined) ?? []
  const data = {
    props: {
      pageProps: {
        requestStatus: 'success',
        searchRequestAndResponse: {
          listings,
          topBlock: [],
          totalResultCount: listings.length,
          maxAllowedPageNumber: 1,
          hasErrors: false,
          ...search
        },
        ...pageProps
      }
    }
  }
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`
}

const zoruaListing = {
  itemId: 'm2436896724',
  title: 'Zorua AR 140/086 - BGS 9.5 - White Flare Japanese',
  date: '30 aug 26',
  reserved: false,
  priceInfo: { priceCents: 4999, priceType: 'MIN_BID' },
  vipUrl: '/v/hobby-en-vrije-tijd/verzamelkaartspellen-pokemon/m2436896724-zorua-ar'
}

describe('parseMarktplaatsShopPage', () => {
  it('reads every live ad with its title, date and reserved mark', () => {
    const dragonite = {
      itemId: 'm2440340001',
      title: 'Dragonite V Full Art 049/078 - PSA 9 - Pokemon GO',
      date: '8 sep 26',
      reserved: true
    }
    expect(parseMarktplaatsShopPage(shopPage({ listings: [zoruaListing, dragonite] }))).toEqual({
      ads: [
        { itemId: 'm2436896724', title: 'Zorua AR 140/086 - BGS 9.5 - White Flare Japanese', date: '30 aug 26', reserved: false },
        { itemId: 'm2440340001', title: 'Dragonite V Full Art 049/078 - PSA 9 - Pokemon GO', date: '8 sep 26', reserved: true }
      ],
      total: 2,
      pages: 1
    })
  })

  it('counts a promoted ad once', () => {
    const shop = parseMarktplaatsShopPage(shopPage({ topBlock: [zoruaListing], listings: [zoruaListing] }))
    expect(shop?.ads.map((ad) => ad.itemId)).toEqual(['m2436896724'])
  })

  it('reports the total and pages when the shop has more ads than one page holds', () => {
    const shop = parseMarktplaatsShopPage(shopPage({ listings: [zoruaListing], totalResultCount: 31, maxAllowedPageNumber: 2 }))
    expect(shop).toMatchObject({ total: 31, pages: 2 })
  })

  it('reads nothing off a page without the shop’s search answer', () => {
    expect(parseMarktplaatsShopPage('<html><body>Even geduld, we controleren je browser</body></html>')).toBeNull()
    expect(parseMarktplaatsShopPage('<script id="__NEXT_DATA__">{not json</script>')).toBeNull()
    expect(parseMarktplaatsShopPage(shopPage({ listings: [zoruaListing], hasErrors: true }))).toBeNull()
    expect(parseMarktplaatsShopPage(shopPage({ listings: [zoruaListing] }, { requestStatus: 'error' }))).toBeNull()
    expect(parseMarktplaatsShopPage(shopPage({ listings: undefined }))).toBeNull()
  })
})

describe('marktplaatsShopPageUrl', () => {
  it('pages the shop page from the second page on', () => {
    expect(marktplaatsShopPageUrl(SHOP_URL, 1)).toBe(SHOP_URL)
    expect(marktplaatsShopPageUrl(SHOP_URL, 2)).toBe('https://www.marktplaats.nl/u/hello-world-cards/25399885/p/2/')
  })
})

describe('isMarktplaatsAdForCard', () => {
  it('matches an ad that starts with the card name and carries its number', () => {
    expect(isMarktplaatsAdForCard({ title: 'Zorua AR', subtitle: '2025 White Flare Japanese - #140' }, zoruaListing.title)).toBe(true)
    expect(
      isMarktplaatsAdForCard({ title: 'Mewtwo', subtitle: '2016 Evolutions - #51' }, 'Mewtwo Reverse 51/108 – PSA 9 – XY Evolutions')
    ).toBe(true)
    expect(
      isMarktplaatsAdForCard(
        { title: 'Vaporeon', subtitle: '2022 Brilliant Stars - #TG02' },
        'Vaporeon Full Art TG02/TG30 - PSA 9 - Brilliant Stars'
      )
    ).toBe(true)
    expect(
      isMarktplaatsAdForCard(
        { title: 'Dragonite V', subtitle: '2022 Pokemon GO - #49' },
        'Dragonite V Full Art 049/078 - PSA 9 - Pokemon GO'
      )
    ).toBe(true)
  })

  it('tells cards with the same name apart by their number', () => {
    expect(
      isMarktplaatsAdForCard({ title: 'Mewtwo', subtitle: '2016 Evolutions - #51' }, 'Mewtwo GX Full Art 39/73 - PSA 9 - Shining Legends')
    ).toBe(false)
  })

  it('does not take the grade for the number, or part of a name for the name', () => {
    expect(
      isMarktplaatsAdForCard({ title: 'Mewtwo GX', subtitle: 'Promo - #10' }, 'Mewtwo GX Full Art 39/73 - PSA 10 - Shining Legends')
    ).toBe(false)
    expect(isMarktplaatsAdForCard({ title: 'Mew', subtitle: 'Promo - #39' }, 'Mewtwo GX Full Art 39/73 - PSA 9 - Shining Legends')).toBe(
      false
    )
  })
})

describe('marktplaatsShopStatus', () => {
  const zorua: MarktplaatsCard = {
    id: 5,
    title: 'Zorua AR',
    subtitle: '2025 White Flare Japanese - #140',
    marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436896724'
  }
  const ekans: MarktplaatsCard = {
    id: 4,
    title: 'Ekans',
    subtitle: '2000 Team Rocket - #56',
    marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436738700'
  }
  const ad = (itemId: string, title: string): MarktplaatsShopAd => ({ itemId, title, date: 'Vandaag', reserved: false })
  const zoruaAd = ad('m2436896724', zoruaListing.title)
  const ekansAd = ad('m2436738700', 'Ekans 1st Edition 56/82 - PSA 9 - Team Rocket')

  it('tells the cards whose ad is up from those whose ad has gone', () => {
    const status = marktplaatsShopStatus([zorua, ekans], [ekansAd])
    expect(status.cards.map((row) => [row.card.title, row.ad])).toEqual([
      ['Zorua AR', 'gone'],
      ['Ekans', 'live']
    ])
    expect(status.unclaimed).toEqual([])
  })

  it('pairs a gone ad’s card with its relisted ad', () => {
    const relisted = ad('m2450000001', zoruaListing.title)
    const status = marktplaatsShopStatus([zorua, ekans], [ekansAd, relisted])
    expect(status.cards.find((row) => row.card.id === 5)).toMatchObject({ ad: 'gone', newAd: relisted })
    expect(status.unclaimed).toEqual([])
  })

  it('pairs a card whose dead link was dropped, and a concept going live', () => {
    const lugia: MarktplaatsCard = { id: 24, title: 'Lugia V', subtitle: '2022 Silver Tempest - #138', concept: true }
    const zoruaUnlinked = { ...zorua, marktplaatsUrl: undefined }
    const zoruaNew = ad('m2450000001', zoruaListing.title)
    const lugiaNew = ad('m2450000002', 'Lugia V Full Art 138/195 - PSA 9 - Silver Tempest')
    const status = marktplaatsShopStatus([zoruaUnlinked, lugia], [zoruaNew, lugiaNew])
    expect(status.cards.map((row) => [row.card.title, row.ad, row.newAd?.itemId])).toEqual([
      ['Zorua AR', 'none', 'm2450000001'],
      ['Lugia V', 'none', 'm2450000002']
    ])
  })

  it('leaves a pairing that could go two ways to a person', () => {
    const twin: MarktplaatsCard = { ...zorua, id: 30, marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436000000' }
    const relisted = ad('m2450000001', zoruaListing.title)
    const twoCards = marktplaatsShopStatus([zorua, twin], [relisted])
    expect(twoCards.cards.every((row) => row.newAd == null)).toBe(true)
    expect(twoCards.unclaimed).toEqual([relisted])

    const twoAds = marktplaatsShopStatus([zorua], [relisted, ad('m2450000002', zoruaListing.title)])
    expect(twoAds.cards[0].newAd).toBeUndefined()
    expect(twoAds.unclaimed).toHaveLength(2)
  })

  it('leaves sold cards out, and names one whose ad is still up', () => {
    const pikachu: MarktplaatsCard = {
      id: 14,
      title: 'Pikachu',
      subtitle: '2023 Crown Zenith - #160',
      marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2442365911',
      sold: true
    }
    const pikachuAd = ad('m2442365911', 'Pikachu Full Art 160/159 - PSA 9 - Crown Zenith')
    expect(marktplaatsShopStatus([pikachu, ekans], [ekansAd]).cards.map((row) => row.card.title)).toEqual(['Ekans'])

    const stillUp = marktplaatsShopStatus([pikachu, ekans], [ekansAd, pikachuAd])
    expect(stillUp.soldButLive).toEqual([{ card: pikachu, ad: pikachuAd }])
    expect(stillUp.unclaimed).toEqual([])
  })

  it('never pairs a new ad with a card whose own ad is still up', () => {
    const second = ad('m2450000001', zoruaListing.title)
    const status = marktplaatsShopStatus([zorua], [zoruaAd, second])
    expect(status.cards[0]).toMatchObject({ ad: 'live' })
    expect(status.cards[0].newAd).toBeUndefined()
    expect(status.unclaimed).toEqual([second])
  })
})
