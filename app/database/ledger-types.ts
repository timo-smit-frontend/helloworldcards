export type LedgerItem = {
  id: number
  title: string
  spending: number | null
  listed: number | null
  potentialGain: number | null
}

export type Ledger = {
  spending: number
  listed: number
  potentialGain: number
  items: LedgerItem[]
}
