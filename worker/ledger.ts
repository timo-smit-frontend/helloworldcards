import type { Ledger } from '../app/database/ledger-types'
import { getInventory } from '../app/database/products'

export type { Ledger, LedgerItem, LedgerPeriod, LedgerTotals } from '../app/database/ledger-types'
export { soldItemsForPeriod, summarizeLedger } from '../app/database/ledger'

export function parseListedPrice(price: string | number | undefined): number | null {
  if (price == null || price === '') {
    return null
  }

  if (typeof price === 'number') {
    return Number.isFinite(price) ? price : null
  }

  const raw = price.replace(/€/g, '').trim()
  if (!raw) {
    return null
  }

  if (raw.includes(',')) {
    const value = Number(raw.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(value) ? value : null
  }

  const parts = raw.split('.')
  const last = parts[parts.length - 1]
  if (parts.length > 1 && last && last.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    const value = Number(parts.join(''))
    return Number.isFinite(value) ? value : null
  }

  const value = Number(raw.replace(/\s/g, ''))
  return Number.isFinite(value) ? value : null
}

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
