import { describe, expect, it } from 'vitest'
import type { LedgerItem } from '~/database/ledger-types'
import { buildLedger, parseListedPrice, soldItemsForPeriod, summarizeLedger } from '../worker/ledger'
import { listInventory } from '../worker/cms/db'
import { ensureSeeded } from '../worker/cms/seed'
import { createMemoryD1 } from './helpers/memory-d1'

const now = new Date('2026-08-29T12:00:00')

const items: LedgerItem[] = [
  {
    id: 1,
    title: 'In stock from January',
    subtitle: '',
    image: null,
    spending: 50,
    listed: 80,
    potentialGain: 30,
    sold: false,
    reserved: false,
    soldAt: null,
    acquiredAt: '2026-01-10'
  },
  {
    id: 2,
    title: 'Bought this month',
    subtitle: '',
    image: null,
    spending: 20,
    listed: 40,
    potentialGain: 20,
    sold: false,
    reserved: false,
    soldAt: null,
    acquiredAt: '2026-08-05'
  },
  {
    id: 3,
    title: 'Sold this month',
    subtitle: '',
    image: null,
    spending: 30,
    listed: 60,
    potentialGain: 30,
    sold: true,
    reserved: false,
    soldAt: '2026-08-20',
    acquiredAt: '2026-03-01'
  },
  {
    id: 4,
    title: 'Sold last year',
    subtitle: '',
    image: null,
    spending: 10,
    listed: 25,
    potentialGain: 15,
    sold: true,
    reserved: false,
    soldAt: '2025-12-01',
    acquiredAt: '2025-06-01'
  }
]

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
  it('sums spendings and potential gain from current stock', async () => {
    const db = createMemoryD1()
    await ensureSeeded(db)
    const ledger = buildLedger(await listInventory(db))
    const spendingFromItems = ledger.items.reduce((total, item) => total + (item.spending ?? 0), 0)
    const gainFromItems = ledger.items.reduce((total, item) => total + (item.potentialGain ?? 0), 0)

    expect(ledger.spending).toBe(spendingFromItems)
    expect(ledger.potentialGain).toBe(gainFromItems)
    expect(ledger.spending).toBeGreaterThan(0)
    expect(ledger.items.some((item) => item.potentialGain != null)).toBe(true)
  })

  it('treats potential gain as listed price minus what was paid', async () => {
    const db = createMemoryD1()
    await ensureSeeded(db)
    const ledger = buildLedger(await listInventory(db))
    const withBoth = ledger.items.find((item) => item.spending != null && item.listed != null)

    expect(withBoth).toBeDefined()
    expect(withBoth?.potentialGain).toBe((withBoth?.listed ?? 0) - (withBoth?.spending ?? 0))
  })
})

describe('reserved cards', () => {
  const reserved: LedgerItem = {
    id: 5,
    title: 'Reserved this month',
    subtitle: '',
    image: null,
    spending: 40,
    listed: 100,
    potentialGain: 60,
    sold: false,
    reserved: true,
    soldAt: '2026-08-25',
    acquiredAt: '2026-07-01'
  }

  it('count as sold in the totals and leave the stock', () => {
    const totals = summarizeLedger([...items, reserved], 'month', now)

    expect(totals.sold).toBe(160)
    expect(totals.cardsSold).toBe(2)
    expect(totals.cardsInStock).toBe(2)
    expect(totals.potential).toBe(120)
    expect(totals.realizedProfit).toBe(90)
  })

  it('show up in the recently sold list, newest first, still flagged as reserved', () => {
    const sold = soldItemsForPeriod([...items, reserved], 'all', now)

    expect(sold.map((item) => item.id)).toEqual([5, 3, 4])
    expect(sold[0].reserved).toBe(true)
  })
})

describe('summarizeLedger', () => {
  it('counts all-time spent, sold revenue, and remaining potential', () => {
    const totals = summarizeLedger(items, 'all', now)

    expect(totals.spent).toBe(110)
    expect(totals.sold).toBe(85)
    expect(totals.potential).toBe(120)
    expect(totals.cardsSold).toBe(2)
    expect(totals.cardsInStock).toBe(2)
    expect(totals.realizedProfit).toBe(45)
    expect(totals.realizedMargin).toBe(45 / 40)
    expect(totals.potentialProfit).toBe(50)
    expect(totals.potentialMargin).toBe(50 / 70)
  })

  it('scopes spent and sold to this month and keeps potential as current stock', () => {
    const totals = summarizeLedger(items, 'month', now)

    expect(totals.spent).toBe(50)
    expect(totals.sold).toBe(60)
    expect(totals.potential).toBe(120)
    expect(totals.cardsSold).toBe(1)
    expect(totals.cardsInStock).toBe(2)
    expect(totals.realizedProfit).toBe(30)
    expect(totals.realizedMargin).toBe(1)
    expect(totals.potentialProfit).toBe(50)
    expect(totals.potentialMargin).toBe(50 / 70)
  })
})

describe('soldItemsForPeriod', () => {
  it('lists sold cards from newest sale to oldest', () => {
    expect(soldItemsForPeriod(items, 'all', now).map((item) => item.id)).toEqual([3, 4])
    expect(soldItemsForPeriod(items, 'month', now).map((item) => item.id)).toEqual([3])
  })
})
