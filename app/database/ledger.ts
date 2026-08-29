import type { LedgerItem, LedgerPeriod, LedgerTotals } from './ledger-types'

export type { Ledger, LedgerItem, LedgerPeriod, LedgerTotals } from './ledger-types'

function inSameMonth(iso: string | null, now: Date): boolean {
  if (!iso) {
    return false
  }

  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function soldInPeriod(item: LedgerItem, period: LedgerPeriod, now: Date): boolean {
  if (!item.sold) {
    return false
  }

  return period === 'all' || inSameMonth(item.soldAt, now)
}

function spentInPeriod(item: LedgerItem, period: LedgerPeriod, now: Date): boolean {
  if (period === 'all') {
    return true
  }

  return inSameMonth(item.acquiredAt, now) || inSameMonth(item.soldAt, now)
}

function margin(profit: number, cost: number): number | null {
  if (cost <= 0) {
    return null
  }

  return profit / cost
}

export function soldItemsForPeriod(items: LedgerItem[], period: LedgerPeriod, now = new Date()): LedgerItem[] {
  return items
    .filter((item) => soldInPeriod(item, period, now))
    .sort((left, right) => {
      const leftTime = left.soldAt ? new Date(`${left.soldAt}T00:00:00`).getTime() : 0
      const rightTime = right.soldAt ? new Date(`${right.soldAt}T00:00:00`).getTime() : 0
      return rightTime - leftTime
    })
}

export function summarizeLedger(items: LedgerItem[], period: LedgerPeriod, now = new Date()): LedgerTotals {
  const soldItems = items.filter((item) => soldInPeriod(item, period, now))
  const stockItems = items.filter((item) => !item.sold)
  const spentItems = items.filter((item) => spentInPeriod(item, period, now))

  const soldCost = soldItems.reduce((total, item) => total + (item.spending ?? 0), 0)
  const soldRevenue = soldItems.reduce((total, item) => total + (item.listed ?? 0), 0)
  const realizedProfit = soldItems.reduce((total, item) => {
    if (item.spending == null || item.listed == null) {
      return total
    }
    return total + (item.listed - item.spending)
  }, 0)

  const stockCost = stockItems.reduce((total, item) => total + (item.spending ?? 0), 0)
  const potential = stockItems.reduce((total, item) => total + (item.listed ?? 0), 0)
  const potentialProfit = stockItems.reduce((total, item) => {
    if (item.spending == null || item.listed == null) {
      return total
    }
    return total + (item.listed - item.spending)
  }, 0)

  return {
    spent: spentItems.reduce((total, item) => total + (item.spending ?? 0), 0),
    sold: soldRevenue,
    potential,
    cardsSold: soldItems.length,
    cardsInStock: stockItems.length,
    realizedProfit,
    realizedMargin: margin(realizedProfit, soldCost),
    potentialProfit,
    potentialMargin: margin(potentialProfit, stockCost)
  }
}
