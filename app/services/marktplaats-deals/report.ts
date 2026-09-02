import type { MarketListing } from '../cardmarket/grades'

export type DealSource = 'marktplaats' | 'vinted'

export type MarktplaatsDealRow = {
  title: string
  displayTitle: string
  ask: number
  source: DealSource
  marktplaatsUrl: string
  cardmarketUrl: string
  grade: 9 | 10
  marketFloor: number | null
  edge: number | null
  basis: MarketListing[]
  matchConfidence: 'high' | 'medium'
  querySource: 'label' | 'title'
  pricingNote: string | null
  psaQuery: string | null
}

export type MarktplaatsSkippedRow = {
  title: string
  ask: number | null
  reason: string
  source?: DealSource
  psaQuery?: string | null
  cardmarketUrl?: string | null
}

/** One attempt per candidate — used to tune OCR / Google matching. */
export type MarktplaatsSearchLogEntry = {
  title: string
  ask: number
  source: DealSource
  listingUrl: string
  ocrText: string | null
  psaQuery: string | null
  googleUrl: string | null
  cardmarketUrl: string | null
  outcome: 'deal' | 'skip' | 'no-edge' | 'no-comps'
  reason: string | null
  marketFloor: number | null
  edge: number | null
}

export type MarktplaatsDealsReport = {
  scannedAt: string
  searchUrl: string
  vintedSearchUrl: string
  deals: MarktplaatsDealRow[]
  skipped: MarktplaatsSkippedRow[]
  searches: MarktplaatsSearchLogEntry[]
  errors: string[]
}

export function sortMarktplaatsDeals(deals: MarktplaatsDealRow[]): MarktplaatsDealRow[] {
  return [...deals].sort((left, right) => {
    const leftHasComps = left.marketFloor != null
    const rightHasComps = right.marketFloor != null
    if (leftHasComps !== rightHasComps) {
      return leftHasComps ? -1 : 1
    }
    if (leftHasComps && rightHasComps) {
      return (right.edge ?? 0) - (left.edge ?? 0)
    }
    return 0
  })
}
