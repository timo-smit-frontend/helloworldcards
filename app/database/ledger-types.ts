export type LedgerPeriod = 'all' | 'month'

export type LedgerItem = {
  id: number
  title: string
  /** Set and card number, so two cards with the same name can be told apart. */
  subtitle: string
  /** Front of the slab, or null when the card has no photo yet. */
  image: string | null
  spending: number | null
  listed: number | null
  potentialGain: number | null
  /** Money in. */
  sold: boolean
  /** Sold and on its way, money not in yet — the stats already count it as a sale so it can be flipped back easily. */
  reserved: boolean
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
