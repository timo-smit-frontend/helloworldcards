import { describe, expect, it } from 'vitest'
import { CACHE_VERSION, mergeCaches, type CacheEntry, type DealFinderCache } from '~/services/deal-finder/cache'

function entry(id: string, ask = 10): CacheEntry {
  return {
    id,
    ask,
    shipping: null,
    identifiedAt: '2026-09-12T10:00:00.000Z',
    identity: null,
    label: null,
    query: null,
    googleUrl: null,
    cardmarketUrl: null,
    pricedAt: null,
    floor: null,
    comps: [],
    problem: null
  }
}

function cache(...entries: CacheEntry[]): DealFinderCache {
  return { version: CACHE_VERSION, entries: Object.fromEntries(entries.map((item) => [item.id, item])) }
}

describe('mergeCaches', () => {
  it('takes the scanned source from the scan and every other source from the store', () => {
    const stored = cache(entry('marktplaats:old'), entry('vinted:fresh', 20))
    // The Vinted run started from a copy made before the Marktplaats run rewrote
    // `vinted:fresh` — its copy still carries the old ask and the pruned Marktplaats row.
    const scanned = cache(entry('marktplaats:old'), entry('vinted:fresh', 10), entry('vinted:new'))

    const merged = mergeCaches(stored, scanned, ['vinted'])

    expect(Object.keys(merged.entries).sort()).toEqual(['marktplaats:old', 'vinted:fresh', 'vinted:new'])
    expect(merged.entries['vinted:fresh']?.ask).toBe(10)
  })

  it("drops the scanned source's entries that the scan pruned", () => {
    const stored = cache(entry('marktplaats:gone'), entry('marktplaats:kept'), entry('vinted:other'))
    const scanned = cache(entry('marktplaats:kept'), entry('vinted:other'))

    const merged = mergeCaches(stored, scanned, ['marktplaats'])

    expect(Object.keys(merged.entries).sort()).toEqual(['marktplaats:kept', 'vinted:other'])
  })

  it('starts from nothing when the store holds an older cache', () => {
    const stored: DealFinderCache = { version: CACHE_VERSION - 1, entries: { 'vinted:stale': entry('vinted:stale') } }

    const merged = mergeCaches(stored, cache(entry('marktplaats:1')), ['marktplaats'])

    expect(merged).toEqual(cache(entry('marktplaats:1')))
  })

  it('folds a scan of both marketplaces in whole', () => {
    const stored = cache(entry('marktplaats:gone'), entry('vinted:gone'))
    const scanned = cache(entry('marktplaats:1'), entry('vinted:1'))

    expect(mergeCaches(stored, scanned, ['marktplaats', 'vinted'])).toEqual(scanned)
  })
})
