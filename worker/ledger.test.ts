import { describe, expect, it } from 'vitest'
import { buildLedger, parseListedPrice } from './ledger'

describe('parseListedPrice', () => {
  it('reads euro strings with Dutch thousands separators', () => {
    expect(parseListedPrice('€99')).toBe(99)
    expect(parseListedPrice('€1.200')).toBe(1200)
    expect(parseListedPrice('€1.200,50')).toBe(1200.5)
    expect(parseListedPrice(189)).toBe(189)
  })

  it('returns null when there is no listed price', () => {
    expect(parseListedPrice(undefined)).toBeNull()
    expect(parseListedPrice('')).toBeNull()
  })
})

describe('buildLedger', () => {
  it('sums spendings and potential gain from current stock', () => {
    const ledger = buildLedger()
    const spendingFromItems = ledger.items.reduce((total, item) => total + (item.spending ?? 0), 0)
    const gainFromItems = ledger.items.reduce((total, item) => total + (item.potentialGain ?? 0), 0)

    expect(ledger.spending).toBe(spendingFromItems)
    expect(ledger.potentialGain).toBe(gainFromItems)
    expect(ledger.spending).toBeGreaterThan(0)
    expect(ledger.items.some((item) => item.potentialGain != null)).toBe(true)
  })

  it('treats potential gain as listed price minus what was paid', () => {
    const ledger = buildLedger()
    const withBoth = ledger.items.find((item) => item.spending != null && item.listed != null)

    expect(withBoth).toBeDefined()
    expect(withBoth?.potentialGain).toBe((withBoth?.listed ?? 0) - (withBoth?.spending ?? 0))
  })
})
