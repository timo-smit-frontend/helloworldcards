import type { Ledger } from '../app/database/ledger-types'
import { getInventory } from '../app/database/products'
import { parseListedPrice } from '../app/services/price'

export type { Ledger, LedgerItem, LedgerPeriod, LedgerTotals } from '../app/database/ledger-types'
export { soldItemsForPeriod, summarizeLedger } from '../app/database/ledger'
export { parseListedPrice }

export function buildLedger(): Ledger {
  const items = getInventory().map((product) => {
    const spending = product.cost == null || !Number.isFinite(product.cost) ? null : product.cost
    const listed = parseListedPrice(product.price)
    const potentialGain = spending == null || listed == null ? null : listed - spending

    return {
      id: product.id,
      title: product.title,
      spending,
      listed,
      potentialGain,
      sold: product.sold === true,
      soldAt: product.soldAt ?? null,
      acquiredAt: product.acquiredAt ?? null
    }
  })

  return {
    spending: items.reduce((total, item) => total + (item.spending ?? 0), 0),
    listed: items.reduce((total, item) => total + (item.listed ?? 0), 0),
    potentialGain: items.reduce((total, item) => total + (item.potentialGain ?? 0), 0),
    items
  }
}
