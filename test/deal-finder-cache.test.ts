import { describe, expect, it } from 'vitest'
import {
  CACHE_VERSION,
  hasFreshFloor,
  hasFreshMatch,
  mergeCaches,
  pruneCache,
  type CacheEntry,
  type DealFinderCache,
  type ProductMatch,
  type RememberedFloor
} from '~/services/deal-finder/cache'

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
  return { version: CACHE_VERSION, entries: Object.fromEntries(entries.map((item) => [item.id, item])), products: {}, floors: {} }
}

const NOW = new Date('2026-09-27T20:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function match(url: string | null, at: string): ProductMatch {
  return { url, query: 'Charmander #168 english cardmarket', googleUrl: 'https://www.google.com/search?q=x', at }
}

function floor(value: number | null, at: string): RememberedFloor {
  return {
    productUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charmander-MEW168',
    floor: value,
    comps: [],
    error: null,
    wrongCard: false,
    at
  }
}

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
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

describe('what is remembered about a card rather than a listing', () => {
  it('keeps a found product for a month and a search that found nothing for a week', () => {
    expect(hasFreshMatch(match('https://cm/product', ago(20 * DAY)), NOW)).toBe(true)
    expect(hasFreshMatch(match('https://cm/product', ago(31 * DAY)), NOW)).toBe(false)
    expect(hasFreshMatch(match(null, ago(6 * DAY)), NOW)).toBe(true)
    expect(hasFreshMatch(match(null, ago(8 * DAY)), NOW)).toBe(false)
  })

  it('trusts a floor for as long as a listing price is trusted', () => {
    expect(hasFreshFloor(floor(170, ago(11 * 60 * 60 * 1000)), NOW)).toBe(true)
    expect(hasFreshFloor(floor(170, ago(13 * 60 * 60 * 1000)), NOW)).toBe(false)
  })

  it('keeps what either marketplace learned, and the later answer where both asked', () => {
    const stored = { ...cache(), products: { a: match('https://cm/old', ago(DAY)), b: match('https://cm/b', ago(DAY)) } }
    const scanned = { ...cache(), products: { a: match('https://cm/new', ago(0)), c: match(null, ago(0)) } }

    const merged = mergeCaches(stored, scanned, ['vinted'])

    expect(merged.products).toEqual({ a: scanned.products.a, b: stored.products.b, c: scanned.products.c })
  })

  it('forgets cards once their answers are too old to use, whatever the scan walked', () => {
    const scanned: DealFinderCache = {
      ...cache(),
      products: { fresh: match('https://cm/p', ago(DAY)), stale: match(null, ago(8 * DAY)) },
      floors: { fresh: floor(170, ago(60_000)), stale: floor(170, ago(DAY)) }
    }

    const pruned = pruneCache(scanned, new Set(), ['marktplaats'], NOW)

    expect(Object.keys(pruned.products ?? {})).toEqual(['fresh'])
    expect(Object.keys(pruned.floors ?? {})).toEqual(['fresh'])
  })
})
