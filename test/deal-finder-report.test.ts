import { describe, expect, it } from 'vitest'
import { listingCost } from '~/services/deal-finder/cost'
import { emptyReport, isCurrentReport, mergeReports } from '~/services/deal-finder/report'
import type { DealFinderReport, DealRow, DealSource, SourceSummary } from '~/services/deal-finder/types'

function dealRow(cost: DealRow['cost'] | undefined, source: DealSource = 'marktplaats', edge = 41.5): DealRow {
  return {
    id: `${source}:1`,
    source,
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
    edge,
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

const paidCost = (source: DealSource) => listingCost({ source, ask: 90, shipping: null })

function summary(source: DealSource, scannedAt: string, tallies: Partial<SourceSummary> = {}): SourceSummary {
  return {
    source,
    url: `https://${source}.example/search`,
    scannedAt,
    found: 1,
    candidates: 1,
    error: null,
    total: null,
    notes: [],
    belowEdge: 0,
    outOfScope: 0,
    fromCache: 0,
    ...tallies
  }
}

/** A report of one marketplace, as a single-source scan hands one back. */
function scanOf(source: DealSource, scannedAt: string, edge: number, tallies: Partial<SourceSummary> = {}): DealFinderReport {
  return {
    ...emptyReport(scannedAt),
    sources: [summary(source, scannedAt, tallies)],
    deals: [dealRow(paidCost(source), source, edge)],
    belowEdge: tallies.belowEdge ?? 0,
    outOfScope: tallies.outOfScope ?? 0,
    fromCache: tallies.fromCache ?? 0
  }
}

describe('mergeReports', () => {
  it("keeps the other marketplace's rows when one of them is rescanned", () => {
    const stored = mergeReports(null, scanOf('vinted', '2026-09-10T08:00:00.000Z', 20))
    const merged = mergeReports(stored, scanOf('marktplaats', '2026-09-10T12:00:00.000Z', 45))

    // Both lists are there, best edge first, however the two scans were started.
    expect(merged.deals.map((deal) => deal.source)).toEqual(['marktplaats', 'vinted'])
    expect(merged.sources.map((source) => source.source)).toEqual(['marktplaats', 'vinted'])
    // Each source still says when it was last read; the report says the newer of the two.
    expect(merged.sources.map((source) => source.scannedAt)).toEqual(['2026-09-10T12:00:00.000Z', '2026-09-10T08:00:00.000Z'])
    expect(merged.scannedAt).toBe('2026-09-10T12:00:00.000Z')
  })

  it('replaces what the rescanned marketplace last found', () => {
    const stored = mergeReports(null, scanOf('marktplaats', '2026-09-10T08:00:00.000Z', 45))
    const merged = mergeReports(stored, {
      ...emptyReport('2026-09-10T12:00:00.000Z'),
      sources: [summary('marktplaats', '2026-09-10T12:00:00.000Z', { found: 0, candidates: 0 })]
    })

    // The listing it found this morning is gone from Marktplaats, so it is gone here.
    expect(merged.deals).toEqual([])
  })

  it('adds the per-source tallies back up', () => {
    const stored = mergeReports(null, scanOf('vinted', '2026-09-10T08:00:00.000Z', 20, { belowEdge: 3, outOfScope: 7, fromCache: 1 }))
    const merged = mergeReports(
      stored,
      scanOf('marktplaats', '2026-09-10T12:00:00.000Z', 45, { belowEdge: 2, outOfScope: 5, fromCache: 4 })
    )

    expect(merged).toMatchObject({ belowEdge: 5, outOfScope: 12, fromCache: 5 })
  })

  it('starts over rather than merge into a report from before the split', () => {
    const legacy = {
      ...emptyReport('2026-09-10T08:00:00.000Z'),
      // No scannedAt, notes or tallies on the summary: nothing to fold a single source into.
      sources: [{ source: 'vinted', url: 'https://vinted.example/search', found: 1, candidates: 1, error: null, total: null }],
      deals: [dealRow(paidCost('vinted'), 'vinted', 20)]
    } as unknown as DealFinderReport

    const next = scanOf('marktplaats', '2026-09-10T12:00:00.000Z', 45)
    expect(mergeReports(legacy, next)).toEqual(next)
  })
})
