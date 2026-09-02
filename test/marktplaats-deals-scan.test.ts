import { describe, expect, it } from 'vitest'
import { runMarktplaatsDealsScan } from '~/services/marktplaats-deals/scan'
import { sortMarktplaatsDeals, type MarktplaatsDealRow } from '~/services/marktplaats-deals/report'

const overviewFixture = `
"listings":[
  {"title":"Charizard GX SM211 PSA 9 MINT Pokémon Kaart","vipUrl":"/v/hobby/m-charizard","priceInfo":{"priceCents":3500,"priceType":"MIN_BID"},"sellerInformation":{"sellerName":"Seller"},"pictures":[{"largeUrl":"https://images.example/charizard.jpg"}]},
  {"title":"Vaporeon VMAX PSA 9 Mint Pokémon Kaart","vipUrl":"/v/hobby/m-vaporeon","priceInfo":{"priceCents":11000,"priceType":"MIN_BID"},"sellerInformation":{"sellerName":"Seller"},"pictures":[{"largeUrl":"https://images.example/vaporeon.jpg"}]}
]
`

const googleHtml = `<a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Hidden-Fates/Charizard-GX-V1-SM211">Charizard GX</a>`
const offersRow = (price: string) => `
  <div id="articleRow1" class="article-row">
    <a href="/en/Pokemon/Users/Comp">Comp</a>
    <span>PSA 9</span>
    <span>${price}</span>
  </div>
`

describe('runMarktplaatsDealsScan', () => {
  it('OCRs the PSA label, Googles it, and keeps deals ≥ €15 under Cardmarket floor', async () => {
    const urls: string[] = []
    const report = await runMarktplaatsDealsScan({
      delayMs: 0,
      searchUrl: 'https://example.com/search',
      fetchImage: async () => new Uint8Array([1, 2, 3]),
      ocrImage: async () => `2019 POKEMON SM\nCHARIZARD-GX SM211\nHIDDEN FATES #SM211`,
      fetchPage: async (url) => {
        urls.push(url)
        if (url.includes('example.com/search') || url.includes('vinted.nl/catalog')) {
          return url.includes('vinted.nl/catalog') ? '' : overviewFixture
        }
        if (url.includes('google.com')) {
          return googleHtml
        }
        return offersRow('70,00 €')
      }
    })

    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]).toMatchObject({
      title: 'Charizard GX SM211 PSA 9 MINT Pokémon Kaart',
      ask: 35,
      source: 'marktplaats',
      marketFloor: 70,
      edge: 35,
      matchConfidence: 'high',
      querySource: 'label',
      pricingNote: null,
      psaQuery: expect.stringContaining('cardmarket')
    })
    expect(report.searches.some((entry) => entry.outcome === 'no-edge')).toBe(true)
    expect(urls.some((url) => url.includes('google.com/search'))).toBe(true)
    expect(urls.some((url) => url.includes('minCondition=2'))).toBe(true)
    expect(report.searches.length).toBeGreaterThan(0)
    expect(report.searches[0]).toMatchObject({
      outcome: 'deal',
      psaQuery: expect.stringContaining('cardmarket'),
      ocrText: expect.stringContaining('CHARIZARD')
    })
  })

  it('falls back to title search when OCR cannot read the label', async () => {
    const report = await runMarktplaatsDealsScan({
      delayMs: 0,
      searchUrl: 'https://example.com/search',
      fetchImage: async () => new Uint8Array([1, 2, 3]),
      ocrImage: async () => 'unreadable slab photo',
      fetchPage: async (url) => {
        if (url.includes('example.com/search') || url.includes('vinted.nl/catalog')) {
          return url.includes('vinted.nl/catalog') ? '' : overviewFixture
        }
        if (url.includes('google.com')) {
          return googleHtml
        }
        return offersRow('70,00 €')
      }
    })

    expect(report.deals[0]?.querySource).toBe('title')
    expect(report.deals[0]?.psaQuery).toContain('Charizard')
    expect(report.deals[0]?.psaQuery).toContain('english')
    expect(report.deals[0]?.psaQuery).toContain('cardmarket')
    expect(report.skipped.some((row) => row.reason === 'Could not read PSA label and no card number in title')).toBe(true)
  })

  it('shows rows that matched Cardmarket but have no PSA comps', async () => {
    const report = await runMarktplaatsDealsScan({
      delayMs: 0,
      searchUrl: 'https://example.com/search',
      fetchImage: async () => new Uint8Array([1, 2, 3]),
      ocrImage: async () => `2019 POKEMON SM\nCHARIZARD-GX SM211\nHIDDEN FATES #SM211`,
      fetchPage: async (url) => {
        if (url.includes('example.com/search') || url.includes('vinted.nl/catalog')) {
          return url.includes('vinted.nl/catalog') ? '' : overviewFixture
        }
        if (url.includes('google.com')) {
          return googleHtml
        }
        return offersRow('70,00 €').replace('PSA 9', 'PSA 8')
      }
    })

    const manual = report.deals.find((row) => row.pricingNote?.includes('No PSA 9 comps'))
    expect(manual).toMatchObject({
      marketFloor: null,
      edge: null,
      cardmarketUrl: expect.stringContaining('cardmarket.com')
    })
  })

  it('sorts rows with comps above rows without comps', () => {
    const row = (marketFloor: number | null, edge: number | null): MarktplaatsDealRow => ({
      title: 'Test',
      displayTitle: 'Test EN PSA 9',
      ask: 10,
      source: 'marktplaats',
      marktplaatsUrl: 'https://example.com/a',
      cardmarketUrl: 'https://example.com/b',
      grade: 9,
      marketFloor,
      edge,
      basis: [],
      matchConfidence: 'medium',
      querySource: 'title',
      pricingNote: marketFloor == null ? 'No comps' : null,
      psaQuery: null
    })

    expect(sortMarktplaatsDeals([row(null, null), row(70, 5), row(80, 35)]).map((item) => item.edge)).toEqual([35, 5, null])
  })
})
