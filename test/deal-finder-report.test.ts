import { describe, expect, it } from 'vitest'
import { listingCost } from '~/services/deal-finder/cost'
import { emptyReport, isCurrentReport } from '~/services/deal-finder/report'
import type { DealRow } from '~/services/deal-finder/types'

function dealRow(cost: DealRow['cost'] | undefined): DealRow {
  return {
    id: 'marktplaats:m1',
    source: 'marktplaats',
    title: 'Charizard PSA 9',
    ask: 90,
    cost: cost as DealRow['cost'],
    listingUrl: 'https://www.marktplaats.nl/v/m1',
    imageUrl: null,
    displayTitle: 'Charizard (4) EN — PSA 9',
    card: {
      name: 'Charizard',
      cardNumber: '4',
      setName: 'Base Set',
      setCode: null,
      language: 'english',
      grade: 9,
      certNumber: null,
      reverseHolo: false,
      firstEdition: false,
      confidence: 'high',
      signals: []
    },
    cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Charizard',
    marketFloor: 140,
    edge: 41.5,
    comps: [],
    googleUrl: null,
    query: null
  }
}

describe('isCurrentReport', () => {
  it('keeps a report whose rows carry what the listing costs', () => {
    const report = {
      ...emptyReport('2026-09-07T20:00:00.000Z'),
      deals: [dealRow(listingCost({ source: 'marktplaats', ask: 90, shipping: null }))]
    }
    expect(isCurrentReport(report)).toBe(true)
  })

  it('drops a report written before fees and postage were counted', () => {
    const report = { ...emptyReport('2026-09-07T20:00:00.000Z'), deals: [dealRow(undefined)] }
    expect(isCurrentReport(report)).toBe(false)
  })

  it('has nothing to drop when there was no scan', () => {
    expect(isCurrentReport(null)).toBe(false)
    expect(isCurrentReport(emptyReport('2026-09-07T20:00:00.000Z'))).toBe(true)
  })
})
