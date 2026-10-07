import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { inMemoryMarketMemory, type MarketMemory } from '~/services/deal-finder/memory'
import type { SourceListing } from '~/services/deal-finder/types'
import { marketMemory } from '../vite/deal-finder-memory'

function listing(id: string, title: string, ask: number, sellerAsk?: number): SourceListing {
  return {
    id: `vinted:${id}`,
    source: 'vinted',
    listingId: id,
    title,
    description: null,
    ask,
    sellerAsk,
    listingUrl: `https://www.vinted.nl/items/${id}`,
    sellerName: null,
    sellerId: null,
    priceType: 'FIXED',
    imageUrls: [],
    itemType: null,
    shipping: null,
    listedOn: null
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deal-finder-memory-'))
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

describe.each<[string, () => MarketMemory]>([
  ['in memory', () => inMemoryMarketMemory()],
  ['in SQLite', () => marketMemory(root)]
])('the market memory, %s', (_, open) => {
  it('remembers what a search page showed, and keeps the day a listing was first seen', async () => {
    const memory = open()
    await memory.remember([listing('1', 'Umbreon VMAX 215/203 PSA 10', 526.45, 500)], '2026-10-01T09:00:00.000Z')
    await memory.remember(
      [listing('1', 'Umbreon VMAX 215/203 PSA 10', 505.45, 480), listing('2', 'Pikachu PSA 9', 30)],
      '2026-10-03T09:00:00.000Z'
    )

    const rows = await memory.seenSince('vinted', '2026-10-02T00:00:00.000Z')
    const umbreon = rows.find((row) => row.id === 'vinted:1')
    expect(umbreon).toMatchObject({
      ask: 505.45,
      sellerAsk: 480,
      firstSeen: '2026-10-01T09:00:00.000Z',
      lastSeen: '2026-10-03T09:00:00.000Z'
    })
    // Only one price on the page: the seller's ask is the ask.
    expect(rows.find((row) => row.id === 'vinted:2')).toMatchObject({ ask: 30, sellerAsk: 30 })
  })

  it('leaves out what was last seen before the window, and the other marketplace', async () => {
    const memory = open()
    await memory.remember([listing('3', 'Mew ex PSA 10', 80)], '2026-08-01T09:00:00.000Z')

    const ids = (await memory.seenSince('vinted', '2026-10-02T00:00:00.000Z')).map((row) => row.id)
    expect(ids).not.toContain('vinted:3')
    expect(await memory.seenSince('marktplaats', '2026-01-01T00:00:00.000Z')).toEqual([])
  })
})
