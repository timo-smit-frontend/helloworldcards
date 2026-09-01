import { describe, expect, it } from 'vitest'
import { parseArticleListings } from '~/services/cardmarket/html'
import { cardmarketOffersUrl, isCardmarketChallenge, runCardmarketScan, withProductFrontImages } from '~/services/cardmarket/scan'
import type { InventoryProduct } from '~/database/products'

const ROW = (id: string, seller: string, comment: string, price: string) => `
  <div id="articleRow${id}" class="article-row">
    <a href="/en/Pokemon/Users/${seller}">${seller}</a>
    <span>${comment}</span>
    <span class="color-primary">${price}</span>
  </div>
`

describe('parseArticleListings', () => {
  it('keeps PSA and BGS slabs and drops contender comments', () => {
    const html = [
      ROW('1', 'DinoHut', 'PSA 9', '34,95 €'),
      ROW('2', 'CatDoesThings', 'PSA 10', '100,00 €'),
      ROW('3', 'RawSeller', 'No PSA 10 contender', '12,00 €'),
      ROW('4', 'AceShop', 'ACE 10', '49,99 €')
    ].join('')

    expect(parseArticleListings(html)).toEqual([
      { id: '1', seller: 'DinoHut', comment: 'PSA 9', grader: 'psa', grade: 9, price: 34.95 },
      { id: '2', seller: 'CatDoesThings', comment: 'PSA 10', grader: 'psa', grade: 10, price: 100 }
    ])
  })
})

describe('cardmarketOffersUrl', () => {
  it('sets Japanese Near Mint on a Japanese card', () => {
    expect(cardmarketOffersUrl('https://www.cardmarket.com/en/Pokemon/Products/Singles/Shiny-Star-V/Poke-Kid-s4a197', 'japanese')).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles/Shiny-Star-V/Poke-Kid-s4a197?language=7&minCondition=2'
    )
  })

  it('sets Reverse Holo Yes for a reverse holo card', () => {
    expect(
      cardmarketOffersUrl('https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolutions/Mewtwo-V1-EVO51', 'english', {
        reverseHolo: true
      })
    ).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolutions/Mewtwo-V1-EVO51?language=1&minCondition=2&extra%5BisReverseHolo%5D=Y'
    )
  })

  it('sets First Edition Yes for a 1st edition card', () => {
    expect(
      cardmarketOffersUrl('https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Ekans-TR56', 'english', {
        firstEdition: true
      })
    ).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Ekans-TR56?language=1&minCondition=2&extra%5BisFirstEd%5D=Y')
  })
})

const pokeKid: InventoryProduct = {
  id: 9,
  title: 'Poke Kid',
  subtitle: '2020 Shiny Star V Japanese - #197',
  description: 'PSA 10',
  images: [],
  slug: 'poke-kid',
  price: '€95',
  language: 'japanese',
  grader: 'psa',
  grade: 10,
  cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Shiny-Star-V/Poke-Kid-s4a197'
}

describe('runCardmarketScan', () => {
  it('scans watchable cards and suggests a price move', async () => {
    const startedAt: number[] = []

    const report = await runCardmarketScan({
      products: [pokeKid, { ...pokeKid, id: 1, title: 'Mewtwo', sold: true, cardmarketUrl: 'https://example.com/sold' }],
      previous: null,
      fetchPage: async () => {
        startedAt.push(Date.now())
        await new Promise((resolve) => setTimeout(resolve, 40))
        return ROW('2143449663', 'CatDoesThings', 'PSA 10', '100,00 €')
      }
    })

    expect(report.scannedAt).toEqual(expect.any(String))
    expect(report.products).toHaveLength(1)
    expect(report.products[0]).toMatchObject({
      id: 9,
      title: 'Poke Kid',
      image: null,
      listed: 95,
      suggestion: { direction: 'up', target: 100 }
    })
    expect(startedAt).toHaveLength(1)
  })

  it('fetches each card only after the previous page finishes', async () => {
    const startedAt: number[] = []
    let inFlight = 0
    let overlap = 0
    const second: InventoryProduct = {
      ...pokeKid,
      id: 5,
      title: 'Zorua AR',
      grader: 'beckett',
      grade: 9.5,
      price: '€70',
      cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/White-Flare-JP/Zorua-V2-sv11W140'
    }

    await runCardmarketScan({
      products: [pokeKid, second],
      previous: null,
      fetchPage: async () => {
        inFlight += 1
        overlap = Math.max(overlap, inFlight)
        startedAt.push(performance.now())
        await new Promise((resolve) => setTimeout(resolve, 40))
        inFlight -= 1
        return ROW('2144543683', 'gengargrades', 'PSA 10', '100,00 €')
      }
    })

    expect(startedAt).toHaveLength(2)
    expect(overlap).toBe(1)
    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(35)
  })

  it('records vanished same-grade listings from the previous scan', async () => {
    const report = await runCardmarketScan({
      products: [pokeKid],
      previous: {
        scannedAt: '2026-08-30T12:00:00.000Z',
        products: [
          {
            id: 9,
            title: 'Poke Kid',
            image: null,
            listed: 95,
            url: pokeKid.cardmarketUrl!,
            listings: [
              {
                id: 'gone',
                seller: 'OldShop',
                comment: 'PSA 10',
                grader: 'psa',
                grade: 10,
                price: 90
              }
            ],
            suggestion: { direction: 'down', target: 90, basis: [], notes: [] },
            gone: [],
            error: null
          }
        ]
      },
      fetchPage: async () => ROW('2143449663', 'CatDoesThings', 'PSA 10', '100,00 €')
    })

    expect(report.products[0]?.gone).toEqual([expect.objectContaining({ id: 'gone', seller: 'OldShop', price: 90 })])
    expect(report.products[0]?.suggestion).toMatchObject({ direction: 'up', target: 100 })
  })

  it('marks a Cloudflare challenge as an error instead of empty comps', async () => {
    const report = await runCardmarketScan({
      products: [pokeKid],
      previous: null,
      fetchPage: async () => '<title>Even geduld...</title><h2>Beveiliging wordt geverifieerd</h2>'
    })

    expect(report.products[0]?.error).toMatch(/blocked/i)
    expect(report.products[0]?.suggestion).toBeNull()
  })

  it('treats Cloudflare Attention Required as a blocked scan, not even prices', async () => {
    expect(
      isCardmarketChallenge('<title>Attention Required! | Cloudflare</title><div id="cf-error-details">Sorry, you have been blocked</div>')
    ).toBe(true)

    const report = await runCardmarketScan({
      products: [pokeKid],
      previous: null,
      fetchPage: async () =>
        '<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body><h1>Sorry, you have been blocked</h1></body></html>'
    })

    expect(report.products[0]?.error).toMatch(/blocked/i)
    expect(report.products[0]?.listings).toEqual([])
    expect(report.products[0]?.suggestion).toBeNull()
  })

  it('errors when the page has no Cardmarket offer rows instead of calling prices even', async () => {
    const report = await runCardmarketScan({
      products: [pokeKid],
      previous: null,
      fetchPage: async () => '<html><head><title>Poke Kid</title></head><body><p>No offers markup</p></body></html>'
    })

    expect(report.products[0]?.error).toMatch(/no cardmarket listings/i)
    expect(report.products[0]?.suggestion).toBeNull()
  })

  it('leaves prices even when offer rows exist but none are PSA or BGS slabs', async () => {
    const report = await runCardmarketScan({
      products: [pokeKid],
      previous: null,
      fetchPage: async () => ROW('99', 'RawSeller', 'Near Mint, no grade', '12,00 €')
    })

    expect(report.products[0]?.error).toBeNull()
    expect(report.products[0]?.listings).toEqual([])
    expect(report.products[0]?.suggestion).toBeNull()
  })
})

describe('withProductFrontImages', () => {
  it('fills a missing front image from inventory', () => {
    const report = withProductFrontImages(
      {
        scannedAt: '2026-08-30T12:00:00.000Z',
        products: [
          {
            id: 9,
            title: 'Poke Kid',
            image: null,
            listed: 95,
            url: pokeKid.cardmarketUrl!,
            listings: [],
            suggestion: null,
            gone: [],
            error: null
          }
        ]
      },
      [{ ...pokeKid, images: ['/media/80573086_front.jpg', '/media/80573086_back.jpg'] }]
    )

    expect(report.products[0]?.image).toBe('/media/80573086_front.jpg')
  })

  it('replaces a stale /images/ report thumbnail with the live inventory front', () => {
    const report = withProductFrontImages(
      {
        scannedAt: '2026-08-30T12:00:00.000Z',
        products: [
          {
            id: 9,
            title: 'Poke Kid',
            image: '/images/80573086_front.jpg',
            listed: 95,
            url: pokeKid.cardmarketUrl!,
            listings: [],
            suggestion: null,
            gone: [],
            error: null
          }
        ]
      },
      [{ ...pokeKid, images: ['/media/80573086_front.jpg', '/media/80573086_back.jpg'] }]
    )

    expect(report.products[0]?.image).toBe('/media/80573086_front.jpg')
  })
})
