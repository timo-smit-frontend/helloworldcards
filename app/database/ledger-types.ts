export type LedgerPeriod = 'all' | 'month'

export type LedgerItem = {
  id: number
  title: string
  spending: number | null
  listed: number | null
  potentialGain: number | null
  sold: boolean
  soldAt: string | null
  acquiredAt: string | null
}

export type LedgerTotals = {
  spent: number
  sold: number
  potential: number
  cardsSold: number
  cardsInStock: number
  realizedProfit: number
  realizedMargin: number | null
  potentialProfit: number
  potentialMargin: number | null
}

export type Ledger = {
  spending: number
  listed: number
  potentialGain: number
  items: LedgerItem[]
}
