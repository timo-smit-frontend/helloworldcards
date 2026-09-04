import { describe, expect, it, vi } from 'vitest'
import { CardmarketBlockedError } from '~/services/deal-finder/cardmarket'
import { runDealFinderScan, type SlabReader } from '~/services/deal-finder/scan'
import type { DealFinderCache } from '~/services/deal-finder/cache'
import type { PsaLabel } from '~/services/deal-finder/types'
import { normalizePsaLabel } from '~/services/deal-finder/psa-label'

const MARKTPLAATS_URL = 'https://www.marktplaats.nl/q/pokemon+psa/'
const VINTED_URL = 'https://www.vinted.nl/catalog?search_text=pokemon%20psa'

type Row = { id: string; title: string; cents: number; type?: string }

function marktplaatsOverview(rows: Row[]): string {
  const listings = rows.map((row) =>
    JSON.stringify({
      itemId: row.id,
      title: row.title,
      description: `Beschrijving voor ${row.title}`,
      vipUrl: `/v/hobby/${row.id}-slug`,
      priceInfo: { priceCents: row.cents, priceType: 'FIXED' },
      sellerInformation: { sellerName: 'seller' },
      extendedAttributes: [{ key: 'type', value: row.type ?? 'Losse kaart' }],
      pictures: [{ largeUrl: `https://images.marktplaats.com/${row.id}?rule=x$_83.jpg` }]
    })
  )
  return `<html><script>window.__STATE__={"listings":[${listings.join(',')}]}</script></html>`
}

function marktplaatsDetail(id: string): string {
  return `<html><body><script>window.__CONFIG__={"listing":{"gallery":{"imageUrls":["//images.marktplaats.com/${id}-a?rule=x$_#.jpg","//images.marktplaats.com/${id}-b?rule=x$_#.jpg"]}}}</script>
    <div data-testid="description">Volledige omschrijving voor ${id}.</div></body></html>`
}

function vintedOverview(rows: Array<{ id: string; title: string; ask: string }>): string {
  return rows
    .map(
      (row) => `<div data-testid="product-item-id-${row.id}">
        <img data-testid="product-item-id-${row.id}--image--img" src="https://images1.vinted.net/t/${row.id}/310x430/a.webp?s=1"
          alt="${row.title}, Merk: Pokémon, Staat: Goed, ${row.ask} €, 99.99 €" />
        <a href="/items/${row.id}-slug" data-testid="product-item-id-${row.id}--overlay-link" title="${row.title}, Merk: Pokémon, Staat: Goed, ${row.ask} €, 99.99 €"></a>
      </div>`
    )
    .join('')
}

function googleResults(setSlug: string, productSlug: string): string {
  return `<html><a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/${setSlug}/${productSlug}">result</a></html>`
}

function offersPage(rows: Array<{ seller: string; comment: string; price: string }>): string {
  const html = rows
    .map(
      (row, index) => `<div id="articleRow${index}" class="article-row">
        <a href="/en/Pokemon/Users/${row.seller}">${row.seller}</a>
        <span>${row.comment}</span>
        <span class="color-primary">${row.price}</span>
      </div>`
    )
    .join('')
  return `<html><body>${html}</body></html>`
}

function slab(overrides: Partial<Record<keyof PsaLabel, unknown>> = {}): PsaLabel {
  return normalizePsaLabel({
    year: '2023',
    setLine: 'POKEMON MEW EN',
    cardName: 'CHARMANDER',
    varietyLine: 'ILLUSTRATION RARE',
    cardNumber: '168',
    certNumber: '99887766',
    grade: 9,
    ...overrides
  })
}

/** A page fetcher wired to fixtures, so nothing in the test touches the network. */
function fetcher(pages: { marktplaats?: string; vinted?: string; google?: (url: string) => string; offers?: (url: string) => string }) {
  const calls: string[] = []
  const fetchPage = vi.fn(async (url: string) => {
    calls.push(url)
    if (url.startsWith(MARKTPLAATS_URL)) return pages.marktplaats ?? marktplaatsOverview([])
    if (url.startsWith(VINTED_URL)) return pages.vinted ?? vintedOverview([])
    if (url.includes('marktplaats.nl/v/')) return marktplaatsDetail(url.split('/').pop() ?? 'x')
    if (url.includes('vinted.nl/items')) return '<html><div itemprop="description">Vinted omschrijving</div></html>'
    if (url.includes('google.com/search')) return pages.google?.(url) ?? '<html></html>'
    if (url.includes('cardmarket.com')) return pages.offers?.(url) ?? offersPage([])
    return '<html></html>'
  })
  return { fetchPage, calls }
}

const readCharmander: SlabReader = async () => ({ slabs: [slab()], note: null })

function run(options: Parameters<typeof runDealFinderScan>[0]) {
  return runDealFinderScan({ delayMs: 0, marktplaatsUrl: MARKTPLAATS_URL, vintedUrl: VINTED_URL, ...options })
}

describe('runDealFinderScan', () => {
  it('reports a listing priced well under the Cardmarket floor', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]).toMatchObject({
      source: 'marktplaats',
      ask: 120,
      marketFloor: 170,
      edge: 50,
      displayTitle: 'Charmander (MEW 168) EN — PSA 9'
    })
    expect(report.deals[0]?.cardmarketUrl).toContain('cardmarket.com/en/Pokemon/Products/Singles/151/Charmander-V2-MEW168')
  })

  it('hides listings whose edge is under €15 and only counts them', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '130,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals).toHaveLength(0)
    expect(report.belowEdge).toBe(1)
    expect(report.problems).toHaveLength(0)
  })

  it('sorts the best edge to the top', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([
        { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 },
        { id: 'm2', title: 'Charmander 168/165 151 PSA 9', cents: 5000 }
      ]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals.map((deal) => deal.edge)).toEqual([120, 50])
  })

  it('does not present an impossible edge as a deal', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 19000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '1800,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    // €190 asked against a €1800 floor is a mismatched card, not a €1610 bargain.
    expect(report.deals).toHaveLength(0)
    expect(report.problems).toEqual([
      expect.objectContaining({
        stage: 'match',
        reason: 'Cardmarket price is far above the ask — probably a different card',
        detail: 'Asking €190, Cardmarket floor €1800'
      })
    ])
  })

  it('still reports a big edge on a cheap card', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 1500 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '90,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    // Six times the ask, but only €75 — well within what a real bargain looks like.
    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]?.edge).toBe(75)
  })

  it('lists a card nobody is selling on Cardmarket under the deals', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 10', price: '400,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals).toHaveLength(0)
    expect(report.noComps).toHaveLength(1)
    expect(report.noComps[0]?.reason).toBe('Nobody is selling a PSA 9 on Cardmarket')
  })

  it('explains what went wrong when Google finds no Cardmarket page', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => '<html>no results</html>'
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.problems).toHaveLength(1)
    expect(report.problems[0]).toMatchObject({
      stage: 'match',
      reason: 'No Cardmarket page in the Google results'
    })
    expect(report.problems[0]?.query).toContain('cardmarket')
  })

  it('surfaces lots and skips cards we do not buy', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([
        { id: 'm1', title: 'Jigglypuff & Meowth PSA 9', cents: 8000, type: 'Meerdere kaarten' },
        { id: 'm2', title: 'Fearow psa 8 gym', cents: 6000 },
        { id: 'm3', title: 'Charmander PSA 9', cents: 500 }
      ])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.problems).toEqual([expect.objectContaining({ stage: 'listing', reason: 'Several cards in one listing' })])
    // The PSA 8 and the €5 ask are simply not what we buy.
    expect(report.outOfScope).toBe(2)
  })

  it('reads both Marktplaats and Vinted', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      vinted: vintedOverview([{ id: '900', title: 'Charmander 168/165 151 PSA 9', ask: '110.00' }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals.map((deal) => deal.source).sort()).toEqual(['marktplaats', 'vinted'])
    expect(report.sources.map((source) => source.candidates)).toEqual([1, 1])
  })

  it('says so when a source blocks the scan', async () => {
    const { fetchPage } = fetcher({ marktplaats: '<html>Just a moment...</html>' })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.sources[0]?.error).toBe('Marktplaats showed a bot check instead of results.')
  })

  it('never reports one of our own listings back to us', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm2438948556', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }])
    })

    const { report } = await run({
      fetchPage,
      readSlabs: readCharmander,
      ownListings: [{ marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2438948556' }]
    })

    expect(report.deals).toHaveLength(0)
    expect(report.outOfScope).toBe(1)
  })

  describe('remembering what it already checked', () => {
    const pages = {
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    }

    it('reuses a recent result instead of re-reading the photos', async () => {
      const first = fetcher(pages)
      const readSlabs = vi.fn(readCharmander)
      const { cache } = await run({ fetchPage: first.fetchPage, readSlabs })

      const second = fetcher(pages)
      const { report } = await run({ fetchPage: second.fetchPage, readSlabs, cache })

      expect(report.fromCache).toBe(1)
      expect(report.deals).toHaveLength(1)
      expect(readSlabs).toHaveBeenCalledTimes(1)
      // Only the two search pages — no listing, Google or Cardmarket page loads.
      expect(second.calls).toHaveLength(2)
    })

    it('re-prices a listing once the remembered price has gone stale', async () => {
      const stale: DealFinderCache = {
        entries: {
          'marktplaats:m1': {
            id: 'marktplaats:m1',
            ask: 120,
            identifiedAt: new Date(Date.now() - 60_000).toISOString(),
            identity: {
              name: 'Charmander',
              cardNumber: '168',
              setName: '151',
              setCode: 'MEW',
              language: 'english',
              grade: 9,
              reverseHolo: false,
              firstEdition: false,
              certNumber: null,
              signals: ['title'],
              confidence: 'medium'
            },
            label: null,
            query: 'Charmander 151 #168 english cardmarket',
            googleUrl: 'https://www.google.com/search?q=x',
            cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charmander-V2-MEW168',
            pricedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
            floor: 900,
            comps: [],
            problem: null
          }
        }
      }

      const { fetchPage } = fetcher(pages)
      const readSlabs = vi.fn(readCharmander)
      const { report } = await run({ fetchPage, readSlabs, cache: stale })

      expect(report.fromCache).toBe(0)
      // The identity was still good, so the photos were not read again.
      expect(readSlabs).not.toHaveBeenCalled()
      expect(report.deals[0]?.marketFloor).toBe(170)
    })

    it('retries anything that failed last time', async () => {
      const failed: DealFinderCache = {
        entries: {
          'marktplaats:m1': {
            id: 'marktplaats:m1',
            ask: 120,
            identifiedAt: new Date().toISOString(),
            identity: null,
            label: null,
            query: null,
            googleUrl: null,
            cardmarketUrl: null,
            pricedAt: null,
            floor: null,
            comps: [],
            problem: { stage: 'price', reason: 'Cardmarket bot check blocked this card', detail: null }
          }
        }
      }

      const { fetchPage } = fetcher(pages)
      const { report } = await run({ fetchPage, readSlabs: readCharmander, cache: failed })

      expect(report.fromCache).toBe(0)
      expect(report.deals).toHaveLength(1)
    })
  })

  describe('when Cardmarket asks for a bot check', () => {
    const marktplaats = marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }])

    it('checks the listing again after the run instead of dropping it', async () => {
      let attempts = 0
      const fetchPage = vi.fn(async (url: string) => {
        if (url.startsWith(MARKTPLAATS_URL)) return marktplaats
        if (url.startsWith(VINTED_URL)) return vintedOverview([])
        if (url.includes('marktplaats.nl/v/')) return marktplaatsDetail('m1')
        if (url.includes('google.com/search')) return googleResults('151', 'Charmander-V2-MEW168')
        attempts += 1
        if (attempts === 1) {
          throw new CardmarketBlockedError()
        }
        return offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
      })

      const { report } = await run({ fetchPage, readSlabs: readCharmander })

      expect(attempts).toBe(2)
      expect(report.deals).toHaveLength(1)
      expect(report.problems).toHaveLength(0)
    })

    it('says which card it could not check when the block does not clear', async () => {
      const { fetchPage } = fetcher({
        marktplaats,
        google: () => googleResults('151', 'Charmander-V2-MEW168'),
        offers: () => {
          throw new CardmarketBlockedError()
        }
      })

      const { report } = await run({ fetchPage, readSlabs: readCharmander })

      expect(report.deals).toHaveLength(0)
      expect(report.problems).toEqual([expect.objectContaining({ stage: 'price', reason: 'Cardmarket bot check blocked this card' })])
    })
  })

  it('still works from the listing text alone when no label reader is configured', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage })

    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]?.card.confidence).toBe('medium')
    expect(report.errors[0]).toContain('ANTHROPIC_API_KEY')
  })
})
