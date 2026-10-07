import { describe, expect, it } from 'vitest'
import { ownHistory } from '~/services/deal-finder/own'
import type { Comp, CompSource } from '~/services/deal-finder/types'
import { emptyOwnHistory, valueCard } from '~/services/deal-finder/valuation'

let next = 0
function comp(source: CompSource, price: number): Comp {
  next += 1
  return {
    id: `${source}:${next}`,
    source,
    price,
    shipping: null,
    title: 'Umbreon VMAX 215/203 PSA 10',
    url: `https://example.test/${next}`,
    seller: null,
    country: null,
    seenAt: '2026-10-07T12:00:00.000Z'
  }
}

describe('valueCard', () => {
  it('sells the card at the cheapest believable competitor, whichever site it is on', () => {
    const valuation = valueCard({
      comps: [comp('cardmarket', 520), comp('marktplaats', 495), comp('ebay', 505), comp('vinted', 540)],
      own: emptyOwnHistory()
    })

    expect(valuation.expectedSale).toBe(495)
    expect(valuation.basis?.source).toBe('marktplaats')
    expect(valuation.confidence).toBe('strong')
    expect(valuation.summary).toBe('Cardmarket from €520 · Marktplaats from €495 · Vinted from €540 · eBay EU from €505')
  })

  it('sets aside an ask far under everyone else’s rather than pricing against it', () => {
    const valuation = valueCard({
      comps: [comp('marktplaats', 60), comp('cardmarket', 150), comp('cardmarket', 160), comp('ebay', 170)],
      own: emptyOwnHistory()
    })

    expect(valuation.expectedSale).toBe(150)
    expect(valuation.outliers.map((outlier) => outlier.price)).toEqual([60])
  })

  it('needs three asks before any of them can be called too cheap', () => {
    const valuation = valueCard({ comps: [comp('marktplaats', 60), comp('cardmarket', 150)], own: emptyOwnHistory() })
    expect(valuation.expectedSale).toBe(60)
    expect(valuation.confidence).toBe('strong')
  })

  it('says how much there is to go on', () => {
    expect(valueCard({ comps: [comp('cardmarket', 100)], own: emptyOwnHistory() }).confidence).toBe('thin')
    expect(valueCard({ comps: [comp('cardmarket', 100), comp('cardmarket', 110)], own: emptyOwnHistory() }).confidence).toBe('fair')
    expect(valueCard({ comps: [], own: emptyOwnHistory() })).toMatchObject({ expectedSale: null, basis: null, confidence: 'none' })
  })

  it('keeps why a site had nothing, for the sites that had nothing', () => {
    const valuation = valueCard({
      comps: [comp('marktplaats', 90)],
      own: emptyOwnHistory(),
      notes: { cardmarket: 'Nobody is selling a PSA 10 on Cardmarket', ebay: 'not set up' }
    })

    expect(valuation.perSource).toEqual([
      { source: 'cardmarket', count: 0, lowest: null, note: 'Nobody is selling a PSA 10 on Cardmarket' },
      { source: 'marktplaats', count: 1, lowest: 90, note: null },
      { source: 'vinted', count: 0, lowest: null, note: null },
      { source: 'ebay', count: 0, lowest: null, note: 'not set up' }
    ])
  })

  it('counts a competitor once, however many sources found it', () => {
    const twice = comp('marktplaats', 90)
    expect(valueCard({ comps: [twice, twice], own: emptyOwnHistory() }).comps).toHaveLength(1)
  })

  it('tells what the shop itself got for the card', () => {
    const own = {
      ...emptyOwnHistory(),
      sold: [{ title: 'Umbreon VMAX', price: 540, soldAt: '2026-09-20', daysToSell: 6, via: 'vinted' as const }]
    }
    expect(valueCard({ comps: [comp('cardmarket', 520)], own }).summary).toBe('Cardmarket from €520 · you sold one for €540 in 6 days')
  })
})

describe('ownHistory', () => {
  const products = [
    {
      title: 'Umbreon VMAX',
      subtitle: '2021 Evolving Skies - #215',
      grader: 'psa' as const,
      grade: 10,
      language: 'english' as const,
      price: '€540',
      sold: true,
      soldAt: '2026-09-20',
      acquiredAt: '2026-09-14',
      soldVia: 'vinted' as const
    },
    {
      title: 'Umbreon VMAX',
      subtitle: '2021 Evolving Skies - #215',
      grader: 'psa' as const,
      grade: 10,
      language: 'english' as const,
      price: '€560',
      cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolving-Skies/Umbreon-VMAX-V2-EVS215'
    },
    {
      title: 'Umbreon V',
      subtitle: '2021 Evolving Skies - #188',
      grader: 'psa' as const,
      grade: 9,
      language: 'english' as const,
      price: '€80',
      reserved: true,
      soldAt: '2026-09-30',
      acquiredAt: '2026-09-02'
    },
    {
      title: 'Umbreon VMAX',
      subtitle: '2021 Evolving Skies - #215',
      grader: 'psa' as const,
      grade: 9,
      language: 'english' as const,
      price: '€300',
      sold: true,
      soldAt: '2026-08-01'
    }
  ]

  it('finds this very card, sold and in stock, and how fast the character sells', () => {
    const history = ownHistory({
      card: { name: 'Umbreon VMAX', cardNumber: '215', language: 'english', grade: 10 },
      cardmarketUrl: null,
      products
    })

    expect(history.sold).toEqual([
      { title: 'Umbreon VMAX 2021 Evolving Skies - #215', price: 540, soldAt: '2026-09-20', daysToSell: 6, via: 'vinted' }
    ])
    expect(history.inStock).toEqual([{ title: 'Umbreon VMAX 2021 Evolving Skies - #215', price: 560 }])
    // Two Umbreon sales with both dates on the books, a reservation included: 6 and 28 days.
    expect(history.characterSales).toBe(2)
    expect(history.characterDaysToSell).toBe(17)
  })

  it('ties a product to the card by its Cardmarket page, whatever its title says', () => {
    const history = ownHistory({
      card: { name: 'UMBREON VMAX', cardNumber: null, language: 'english', grade: 10 },
      cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolving-Skies/Umbreon-VMAX-V2-EVS215?language=1',
      products
    })
    expect(history.inStock.map((item) => item.price)).toEqual([560])
  })
})
