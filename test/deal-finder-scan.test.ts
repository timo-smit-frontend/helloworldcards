import { describe, expect, it, vi } from 'vitest'
import {
  CardmarketBlockedError,
  cardmarketProductNumber,
  cardmarketVersionsUrl,
  isVersionedProduct,
  numbersDisagree,
  sameCardVersions
} from '~/services/deal-finder/cardmarket'
import { MARKTPLAATS_PAGE_SIZE } from '~/services/deal-finder/marktplaats'
import { runDealFinderScan, type SlabReader } from '~/services/deal-finder/scan'
import { CACHE_VERSION, type DealFinderCache } from '~/services/deal-finder/cache'
import type { EbayItem } from '~/services/deal-finder/ebay'
import { inMemoryMarketMemory } from '~/services/deal-finder/memory'
import type { CardIdentity, PsaLabel } from '~/services/deal-finder/types'
import { normalizePsaLabel } from '~/services/deal-finder/psa-label'

const MARKTPLAATS_URL = 'https://www.marktplaats.nl/q/pokemon+psa/#offeredSince:Vandaag'
/** Marktplaats is asked through its search endpoint, whatever browse URL it was given. */
const MARKTPLAATS_API = 'https://www.marktplaats.nl/lrp/api/search'
const VINTED_URL = 'https://www.vinted.nl/catalog?search_text=pokemon%20psa'

type Row = { id: string; title: string; cents: number; type?: string; sellerId?: string; date?: string }

/**
 * A page of the search feed. Marktplaats never applies the date window the URL asks
 * for, so every row carries the date it was put up; `total` is both what the feed's
 * `offeredSince` facet counts for today and, for a search without a window, the size
 * of the whole search.
 */
function marktplaatsOverview(rows: Row[], total = rows.length): string {
  const listings = rows.map((row) =>
    JSON.stringify({
      itemId: row.id,
      title: row.title,
      description: `Beschrijving voor ${row.title}`,
      vipUrl: `/v/hobby/${row.id}-slug`,
      priceInfo: { priceCents: row.cents, priceType: 'FIXED' },
      date: row.date ?? 'Vandaag',
      sellerInformation: { sellerName: 'seller', sellerId: row.sellerId ?? '900100' },
      extendedAttributes: [{ key: 'type', value: row.type ?? 'Losse kaart' }],
      pictures: [{ largeUrl: `https://images.marktplaats.com/${row.id}?rule=x$_83.jpg` }]
    })
  )
  const facet = `{"key":"offeredSince","attributeGroup":[{"attributeValueKey":"Vandaag","histogramCount":${total}}]}`
  return `{"listings":[${listings.join(',')}],"facets":[${facet}],"totalResultCount":${total}}`
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

/**
 * What Google answers with now: no result URL in the page at all, only a title and an
 * opaque redirect that has to be followed to find out where the result points.
 */
function googleRedirectResults(title: string, token: string): string {
  return `<html>,[null,null,5,null,"${title}",null,"/goto?url\\u003d${token}",null,null,1]</html>`
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

/** Marktplaats pages by offset, Vinted by page number. */
function pageNumber(url: string): number {
  const offset = url.match(/[?&]offset=(\d+)/)?.[1]
  return offset ? Number(offset) / MARKTPLAATS_PAGE_SIZE + 1 : Number(url.match(/[?&]page=(\d+)/)?.[1] ?? 1)
}

/** A fixture is either one page of results, or a page each, in order. */
function searchPage(fixture: string | string[] | undefined, url: string, empty: string): string {
  const page = pageNumber(url)
  if (Array.isArray(fixture)) {
    return fixture[page - 1] ?? empty
  }
  return page === 1 ? (fixture ?? empty) : empty
}

/** A page fetcher wired to fixtures, so nothing in the test touches the network. */
function fetcher(pages: {
  marktplaats?: string | string[]
  vinted?: string | string[]
  google?: (url: string) => string
  offers?: (url: string) => string
}) {
  const calls: string[] = []
  const fetchPage = vi.fn(async (url: string) => {
    calls.push(url)
    if (url.startsWith(MARKTPLAATS_API)) return searchPage(pages.marktplaats, url, marktplaatsOverview([]))
    if (url.startsWith(VINTED_URL)) return searchPage(pages.vinted, url, vintedOverview([]))
    if (url.includes('marktplaats.nl/v/')) return marktplaatsDetail(url.split('/').pop() ?? 'x')
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
  it('never looks at a card whose Marktplaats seller has no reviews', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([
        { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000, sellerId: '111' },
        { id: 'm2', title: 'Charmander 168/165 151 PSA 9', cents: 12000, sellerId: '222' }
      ]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    const readSlabs = vi.fn(readCharmander)
    const sellerReviews = vi.fn(async (sellerId: string) => (sellerId === '111' ? 0 : 40))

    const { report } = await run({ fetchPage, readSlabs, sellerReviews })

    expect(report.deals).toHaveLength(1)
    // The unreviewed seller's listing never reached the photo reader.
    expect(readSlabs).toHaveBeenCalledTimes(1)
    expect(report.outOfScope).toBe(1)
  })

  it('reads Vinted only through its search pages, never a listing page or its photos', async () => {
    const { fetchPage, calls } = fetcher({
      vinted: vintedOverview([{ id: '901', title: 'Charmander 168/165 151 PSA 9', ask: '110.00' }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    const readSlabs = vi.fn(readCharmander)

    const { report } = await run({ fetchPage, readSlabs, sources: ['vinted'] })

    // A burst of automated item-page loads gets the whole home connection blocked by Vinted.
    expect(calls.filter((url) => url.includes('vinted.nl/items'))).toEqual([])
    expect(readSlabs).not.toHaveBeenCalled()
    // The title alone identifies the card.
    expect(report.deals.map((deal) => deal.id)).toEqual(['vinted:901'])
  })

  it('asks after a seller once however many listings they have up', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([
        { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000, sellerId: '111' },
        { id: 'm2', title: 'Charmander 168/165 151 PSA 9', cents: 11000, sellerId: '111' }
      ]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    const sellerReviews = vi.fn(async () => 12)

    await run({ fetchPage, readSlabs: readCharmander, sellerReviews })

    expect(sellerReviews).toHaveBeenCalledTimes(1)
  })

  it('does not hold a failed review lookup against the seller', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({
      fetchPage,
      readSlabs: readCharmander,
      sellerReviews: async () => {
        throw new Error('seller profile is down')
      }
    })

    expect(report.deals).toHaveLength(1)
  })

  it('leaves the slab guards and toploaders alone', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([
        { id: 'm1', title: 'PSA Slab Guard - Hard Hoesje - Case - Bumper - Transparant', cents: 1000 },
        { id: 'm2', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }
      ]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    const readSlabs = vi.fn(readCharmander)

    const { report } = await run({ fetchPage, readSlabs })

    // The guard's photo shows a real slab, so it must never reach the label reader.
    expect(readSlabs).toHaveBeenCalledTimes(1)
    expect(report.deals).toHaveLength(1)
  })

  it('throws away a cache an older version of the scan wrote', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    // A priced row that today's rules would read differently; the TTL cannot see that.
    const old = {
      entries: {
        'marktplaats:m1': {
          id: 'marktplaats:m1',
          ask: 120,
          shipping: null,
          identifiedAt: new Date().toISOString(),
          identity: {
            name: 'Lechonk',
            cardNumber: null,
            setName: 'S',
            setCode: 'S',
            language: 'english' as const,
            grade: 10 as const,
            reverseHolo: false,
            firstEdition: false,
            certNumber: null,
            signals: ['title' as const],
            confidence: 'high' as const
          },
          label: null,
          query: 'x',
          googleUrl: 'https://www.google.com/search?q=x',
          cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Obsidian-Flames/Lechonk-V2-OBF209',
          pricedAt: new Date().toISOString(),
          floor: 229,
          comps: [],
          problem: null
        }
      }
    }

    const { report } = await run({ fetchPage, readSlabs: readCharmander, cache: old })

    expect(report.fromCache).toBe(0)
    expect(report.deals[0]?.card.name).toBe('CHARMANDER')
  })

  it('follows the redirect Google hides its result URLs behind', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleRedirectResults('Charmander (MEW 168) 151 - Singles - Cardmarket', 'TOKEN'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    const resolveUrl = vi.fn(async () => 'https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charmander-V2-MEW168')

    const { report } = await run({ fetchPage, readSlabs: readCharmander, resolveUrl })

    expect(resolveUrl).toHaveBeenCalledWith('https://www.google.com/goto?url=TOKEN')
    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]?.cardmarketUrl).toContain('Charmander-V2-MEW168')
  })

  it('keeps following until a redirect lands on the right card', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () =>
        googleRedirectResults('Charmander (MEW 168) 151 - Singles - Cardmarket', 'FIRST') +
        googleRedirectResults('Charmander (168) - 151 - Cardmarket', 'SECOND'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    // Google's top result went to the species page, which prices nothing.
    const resolveUrl = vi.fn(async (url: string) =>
      url.endsWith('FIRST')
        ? 'https://www.cardmarket.com/en/Pokemon/Species/Charmander'
        : 'https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charmander-V2-MEW168'
    )

    const { report } = await run({ fetchPage, readSlabs: readCharmander, resolveUrl })

    expect(resolveUrl).toHaveBeenCalledTimes(2)
    expect(report.deals[0]?.cardmarketUrl).toContain('Charmander-V2-MEW168')
  })

  it('reports no match rather than guessing when nothing can follow the redirects', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleRedirectResults('Charmander (MEW 168) 151 - Singles - Cardmarket', 'TOKEN')
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals).toHaveLength(0)
    expect(report.problems[0]?.reason).toBe('No matching Cardmarket page in the Google results')
  })

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
      // €120 plus €6 Kopersbescherming and €4 postage is €130 out of pocket.
      cost: { fee: 6, shipping: 4, total: 130 },
      // One Cardmarket seller is all there is to go on.
      valuation: { expectedSale: 170, confidence: 'thin' },
      edge: 40,
      displayTitle: 'Charmander (MEW 168) EN, PSA 9'
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

    // €50 costs €56.50 all in against a €170 floor; €120 costs €130.
    expect(report.deals.map((deal) => deal.edge)).toEqual([113.5, 40])
  })

  it('does not present an impossible edge as a deal', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 14000 }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '1800,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    // €140 asked against a €1800 floor is a mismatched card, not a €1650 bargain.
    expect(report.deals).toHaveLength(0)
    expect(report.problems).toEqual([
      expect.objectContaining({
        stage: 'match',
        reason: 'Cardmarket price is far above the ask, probably a different card',
        detail: 'Asking €140, Cardmarket floor €1800'
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

    // Six times the ask, but only €70 once the fee and the postage are paid — well
    // within what a real bargain looks like.
    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]?.edge).toBe(70.25)
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
      reason: 'No matching Cardmarket page in the Google results'
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

  it('leaves other trading card games alone, however well they are graded', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([
        { id: 'm1', title: 'Monkey D. Luffy PSA 10 Gem Mint - OP05 119 - one piece', cents: 6500 },
        { id: 'm2', title: 'Pokémon Charmander 168/165 151 PSA 9, one piece heb ik ook liggen', cents: 12000 }
      ]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    // The One Piece slab is dropped; the Pokémon card whose seller also has One Piece is not.
    expect(report.deals.map((deal) => deal.id)).toEqual(['marktplaats:m2'])
    expect(report.problems).toHaveLength(0)
    expect(report.outOfScope).toBe(1)
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

  it('walks an unwindowed Marktplaats search until it has read every listing the search says it has', async () => {
    const search = 'https://www.marktplaats.nl/q/pokemon+psa/#PriceCentsTo:15000'
    const page = (id: string, cents: number) => marktplaatsOverview([{ id, title: 'Charmander 168/165 151 PSA 9', cents }], 2)
    const { fetchPage, calls } = fetcher({
      marktplaats: [page('m1', 12000), page('m2', 11000)],
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander, marktplaatsUrl: search })

    expect(report.deals.map((deal) => deal.id).sort()).toEqual(['marktplaats:m1', 'marktplaats:m2'])
    expect(report.sources[0]).toMatchObject({ found: 2, candidates: 2, url: search })
    // Both of the two listings are read, and no third page is asked for to find that out.
    expect(calls.filter((url) => url.startsWith(MARKTPLAATS_API)).map(pageNumber)).toEqual([1, 2])
  })

  it('reads only the first three pages of Vinted, which has no date filter', async () => {
    const vinted = (id: string) => vintedOverview([{ id, title: 'Charmander 168/165 151 PSA 9', ask: '110.00' }])
    const { fetchPage, calls } = fetcher({
      vinted: [vinted('901'), vinted('902'), vinted('903'), vinted('904')],
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals.map((deal) => deal.id).sort()).toEqual(['vinted:901', 'vinted:902', 'vinted:903'])
    expect(calls.filter((url) => url.startsWith(VINTED_URL)).map(pageNumber)).toEqual([1, 2, 3])
  })

  it('keeps the earlier pages when a later one is blocked', async () => {
    const { fetchPage } = fetcher({
      marktplaats: [
        // Two listings in the search, so there is a second page for the bot check to land on.
        marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }], 2),
        '<html>Just a moment...</html>'
      ],
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals).toHaveLength(1)
    expect(report.sources[0]?.error).toBeNull()
    expect(report.sources[0]?.notes).toContain('Marktplaats showed a bot check on page 2, stopped after page 1.')
  })

  it('walks only the source it was asked for', async () => {
    const { fetchPage, calls } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      vinted: vintedOverview([{ id: '900', title: 'Charmander 168/165 151 PSA 9', ask: '110.00' }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander, sources: ['vinted'] })

    expect(report.deals.map((deal) => deal.id)).toEqual(['vinted:900'])
    expect(report.sources.map((source) => source.source)).toEqual(['vinted'])
    // Marktplaats is not asked for anything at all, not even its search page.
    expect(calls.filter((url) => url.includes('marktplaats'))).toEqual([])
  })

  it("leaves the other marketplace's cached listings alone when only one is scanned", async () => {
    const cached: DealFinderCache = {
      version: CACHE_VERSION,
      entries: {
        'marktplaats:m1': {
          id: 'marktplaats:m1',
          ask: 120,
          shipping: null,
          identifiedAt: new Date().toISOString(),
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
    }

    const { fetchPage } = fetcher({
      vinted: vintedOverview([{ id: '900', title: 'Charmander 168/165 151 PSA 9', ask: '110.00' }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { cache } = await run({ fetchPage, readSlabs: readCharmander, sources: ['vinted'], cache: cached })

    // A Vinted run knows nothing about which Marktplaats listings are still up, so
    // dropping them would only make the next Marktplaats run re-read every photo.
    expect(Object.keys(cache.entries).sort()).toEqual(['marktplaats:m1', 'vinted:900'])
  })

  it('counts what each source contributed on that source', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([
        { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 },
        { id: 'm2', title: 'Pokemon kaarten partij', cents: 12000, type: 'Meerdere kaarten' }
      ]),
      vinted: vintedOverview([{ id: '900', title: 'Charmander 168/165 151 PSA 9', ask: '110.00' }]),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.sources.map((source) => ({ source: source.source, outOfScope: source.outOfScope }))).toEqual([
      { source: 'marktplaats', outOfScope: 1 },
      { source: 'vinted', outOfScope: 0 }
    ])
    // The report's own number is only the sources added back up.
    expect(report.outOfScope).toBe(1)
  })

  it('only looks at the listings put up inside the date window, and stops at the first page without one', async () => {
    const page1 = marktplaatsOverview([
      { id: 'm1', title: 'Charmander m1 168/165 151 PSA 9', cents: 12000 },
      { id: 'm2', title: 'Charmander m2 168/165 151 PSA 9', cents: 12000, date: 'Gisteren' },
      { id: 'm3', title: 'Charmander m3 168/165 151 PSA 9', cents: 12000, date: '5 sep 26' }
    ])
    const page2 = marktplaatsOverview([{ id: 'm4', title: 'Charmander m4 168/165 151 PSA 9', cents: 12000, date: 'Eergisteren' }])
    const page3 = marktplaatsOverview([{ id: 'm5', title: 'Charmander m5 168/165 151 PSA 9', cents: 12000 }])
    const { fetchPage, calls } = fetcher({
      marktplaats: [page1, page2, page3],
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    // Yesterday's rows were never opened, and the third page was never asked for.
    expect(report.sources[0]).toMatchObject({ found: 1, candidates: 1 })
    expect(calls.filter((url) => url.startsWith(MARKTPLAATS_API))).toHaveLength(2)
    expect(calls.some((url) => url.includes('/v/hobby/m2-slug'))).toBe(false)
    expect(report.deals.map((deal) => deal.listingUrl)).toEqual(['https://www.marktplaats.nl/v/hobby/m1-slug'])
  })

  it("keeps walking for today's rows that bumped listings pushed onto a later page", async () => {
    // Paid bumps and older ads are threaded through the newest-first feed, so a page
    // with even one of today's rows on it is not the end of today.
    const page1 = marktplaatsOverview([
      { id: 'm1', title: 'Charmander m1 168/165 151 PSA 9', cents: 12000 },
      { id: 'm2', title: 'Charmander m2 168/165 151 PSA 9', cents: 12000, date: 'Gisteren' }
    ])
    const page2 = marktplaatsOverview([
      { id: 'm3', title: 'Charmander m3 168/165 151 PSA 9', cents: 12000, date: 'Gisteren' },
      { id: 'm4', title: 'Charmander m4 168/165 151 PSA 9', cents: 12000 }
    ])
    const { fetchPage } = fetcher({
      // The facet's count runs below the rows actually dated today, so it must not end the walk.
      marktplaats: [page1, page2].map((page) => page.replace('"histogramCount":2', '"histogramCount":1')),
      google: () => googleResults('151', 'Charmander-V2-MEW168'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander, maxPages: { marktplaats: 2, vinted: 1 } })

    expect(report.sources[0]).toMatchObject({ found: 2, total: 1 })
    expect(report.deals.map((deal) => deal.listingUrl).sort()).toEqual([
      'https://www.marktplaats.nl/v/hobby/m1-slug',
      'https://www.marktplaats.nl/v/hobby/m4-slug'
    ])
  })

  it('reports an empty day as nothing found rather than as a broken search', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000, date: 'Gisteren' }], 0)
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.sources[0]).toMatchObject({ error: null, found: 0, candidates: 0 })
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

    const charmanderIdentity: CardIdentity = {
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
      // Only search pages — no listing, Google or Cardmarket page loads.
      expect(second.calls.every((url) => url.startsWith(MARKTPLAATS_API) || url.startsWith(VINTED_URL))).toBe(true)
    })

    it('re-prices a listing once the remembered price has gone stale', async () => {
      const stale: DealFinderCache = {
        version: CACHE_VERSION,
        entries: {
          'marktplaats:m1': {
            id: 'marktplaats:m1',
            ask: 120,
            shipping: null,
            identifiedAt: new Date(Date.now() - 60_000).toISOString(),
            identity: charmanderIdentity,
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
      expect(report.deals[0]?.valuation.expectedSale).toBe(170)
    })

    /** Whatever a run concluded about `m1`, written as the cache would have written it. */
    function remembered(patch: Partial<DealFinderCache['entries'][string]>): DealFinderCache {
      return {
        version: CACHE_VERSION,
        entries: {
          'marktplaats:m1': {
            id: 'marktplaats:m1',
            ask: 120,
            shipping: null,
            identifiedAt: new Date(Date.now() - 60_000).toISOString(),
            identity: null,
            label: null,
            query: null,
            googleUrl: null,
            cardmarketUrl: null,
            pricedAt: null,
            floor: null,
            comps: [],
            problem: null,
            ...patch
          }
        }
      }
    }

    it('does not read the photos again of a listing it already wrote off', async () => {
      const cache = remembered({ problem: { stage: 'identify', reason: 'No card number or set on the listing or the slab', detail: null } })
      const second = fetcher(pages)
      const readSlabs = vi.fn(readCharmander)

      const { report } = await run({ fetchPage: second.fetchPage, readSlabs, cache })

      expect(readSlabs).not.toHaveBeenCalled()
      expect(report.fromCache).toBe(1)
      expect(report.problems.map((row) => row.reason)).toEqual(['No card number or set on the listing or the slab'])
      // Only the search pages — the listing page was never opened.
      expect(second.calls.every((url) => url.startsWith(MARKTPLAATS_API) || url.startsWith(VINTED_URL))).toBe(true)
    })

    it('does not search Google again for a card it already failed to match', async () => {
      const cache = remembered({
        identity: charmanderIdentity,
        query: 'Charmander 151 #168 english cardmarket',
        googleUrl: 'https://www.google.com/search?q=x',
        problem: { stage: 'match', reason: 'No matching Cardmarket page in the Google results', detail: null }
      })
      const second = fetcher(pages)
      const readSlabs = vi.fn(readCharmander)

      const { report } = await run({ fetchPage: second.fetchPage, readSlabs, cache })

      expect(report.fromCache).toBe(1)
      expect(report.problems[0]?.googleUrl).toBe('https://www.google.com/search?q=x')
      expect(second.calls.some((url) => url.includes('google.com/search'))).toBe(false)
    })

    it('counts a remembered out-of-scope listing without checking it again', async () => {
      const second = fetcher(pages)
      const readSlabs = vi.fn(readCharmander)

      const { report } = await run({ fetchPage: second.fetchPage, readSlabs, cache: remembered({}) })

      expect(readSlabs).not.toHaveBeenCalled()
      expect(report.outOfScope).toBe(1)
      expect(report.fromCache).toBe(1)
      expect(report.problems).toHaveLength(0)
    })

    it('checks a written-off listing again once its asking price changes', async () => {
      const cache = remembered({
        ask: 95,
        problem: { stage: 'identify', reason: 'No card number or set on the listing or the slab', detail: null }
      })
      const readSlabs = vi.fn(readCharmander)

      const { report } = await run({ fetchPage: fetcher(pages).fetchPage, readSlabs, cache })

      expect(readSlabs).toHaveBeenCalledTimes(1)
      expect(report.fromCache).toBe(0)
      expect(report.deals).toHaveLength(1)
    })

    it('checks a written-off listing again once the week is up', async () => {
      const cache = remembered({
        identifiedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        problem: { stage: 'identify', reason: 'No card number or set on the listing or the slab', detail: null }
      })
      const readSlabs = vi.fn(readCharmander)

      const { report } = await run({ fetchPage: fetcher(pages).fetchPage, readSlabs, cache })

      expect(readSlabs).toHaveBeenCalledTimes(1)
      expect(report.fromCache).toBe(0)
      expect(report.deals).toHaveLength(1)
    })

    it('retries anything that failed last time', async () => {
      const failed: DealFinderCache = {
        version: CACHE_VERSION,
        entries: {
          'marktplaats:m1': {
            id: 'marktplaats:m1',
            ask: 120,
            shipping: null,
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
        if (url.startsWith(MARKTPLAATS_API)) return searchPage(marktplaats, url, marktplaatsOverview([]))
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

  describe('reading several listings at once', () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    it('reads both searches at once, and still reports them in source order', async () => {
      const started: string[] = []
      const finished: string[] = []
      const { fetchPage } = fetcher({
        marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
        vinted: vintedOverview([{ id: '901', title: 'Charmander 168/165 151 PSA 9', ask: '110.00' }]),
        google: () => googleResults('151', 'Charmander-V2-MEW168'),
        offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
      })

      // Marktplaats' search is the slow one, so if the two were still read one after the
      // other Vinted's search would not be asked for until it had answered.
      const delayed = vi.fn(async (url: string) => {
        const search = url.startsWith(MARKTPLAATS_API) ? 'marktplaats' : url.startsWith(VINTED_URL) ? 'vinted' : null
        if (search) {
          started.push(search)
        }
        if (search === 'marktplaats') {
          await sleep(20)
        }
        const html = await fetchPage(url)
        if (search) {
          finished.push(search)
        }
        return html
      })

      const { report } = await run({ fetchPage: delayed, readSlabs: readCharmander })

      // Vinted's first page — and its second — go out while Marktplaats is still answering.
      expect(started.slice(0, 2)).toEqual(['marktplaats', 'vinted'])
      expect(finished[0]).toBe('vinted')
      // Vinted answered first, but the report is written in source order all the same.
      expect(report.sources.map((source) => source.source)).toEqual(['marktplaats', 'vinted'])
      expect(report.deals.map((deal) => deal.id).sort()).toEqual(['marktplaats:m1', 'vinted:901'])
    })

    it('keeps problems in listing order when a slow photo read finishes last', async () => {
      const { fetchPage } = fetcher({
        marktplaats: marktplaatsOverview([
          { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 },
          { id: 'm2', title: 'Charmander 168/165 151 PSA 9', cents: 11000 },
          { id: 'm3', title: 'Charmander 168/165 151 PSA 9', cents: 10000 }
        ]),
        google: () => '<html></html>',
        offers: () => offersPage([])
      })

      // Photos are read several listings at a time, so the first listing's reading is
      // the last one to come back — the order they finish in is not the report's order.
      const order: string[] = []
      const readSlabs: SlabReader = async ({ listing }) => {
        if (listing.id === 'marktplaats:m1') {
          await sleep(30)
        }
        order.push(listing.id)
        return { slabs: [slab()], note: null }
      }

      const { report } = await run({ fetchPage, readSlabs })

      expect(order).toEqual(['marktplaats:m2', 'marktplaats:m3', 'marktplaats:m1'])
      expect(report.problems.map((problem) => problem.id)).toEqual(['marktplaats:m1', 'marktplaats:m2', 'marktplaats:m3'])
      expect(report.problems.every((problem) => problem.stage === 'match')).toBe(true)
    })
  })

  describe('asking about each card once', () => {
    const twoCharmanders = marktplaatsOverview([
      { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 },
      { id: 'm2', title: 'Charmander 168/165 151 PSA 9', cents: 11000 }
    ])

    it('searches Google and loads Cardmarket once for a card two listings show', async () => {
      const { fetchPage, calls } = fetcher({
        marktplaats: twoCharmanders,
        google: () => googleResults('151', 'Charmander-MEW168'),
        offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
      })

      const { report } = await run({ fetchPage, readSlabs: readCharmander })

      expect(report.deals.map((deal) => deal.id)).toEqual(['marktplaats:m2', 'marktplaats:m1'])
      expect(calls.filter((url) => url.includes('google.com/search'))).toHaveLength(1)
      expect(calls.filter((url) => url.includes('cardmarket.com'))).toHaveLength(1)
    })

    it("knows a card's Cardmarket page and floor from an earlier scan, for a listing it has never seen", async () => {
      const pages = {
        google: () => googleResults('151', 'Charmander-MEW168'),
        offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
      }
      const first = fetcher({
        ...pages,
        marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }])
      })
      const { cache } = await run({ fetchPage: first.fetchPage, readSlabs: readCharmander })

      const second = fetcher({
        ...pages,
        marktplaats: marktplaatsOverview([{ id: 'm9', title: 'Charmander 168/165 151 PSA 9', cents: 9000 }])
      })
      const { report } = await run({ fetchPage: second.fetchPage, readSlabs: readCharmander, cache })

      expect(report.deals.map((deal) => [deal.id, deal.valuation.expectedSale])).toEqual([['marktplaats:m9', 170]])
      expect(second.calls.some((url) => url.includes('google.com/search') || url.includes('cardmarket.com'))).toBe(false)
    })

    it('does not remember a card Cardmarket would not show, so the next listing of it tries again', async () => {
      let blocked = true
      const { fetchPage, calls } = fetcher({
        marktplaats: twoCharmanders,
        google: () => googleResults('151', 'Charmander-MEW168'),
        offers: () => {
          if (blocked) {
            blocked = false
            throw new CardmarketBlockedError()
          }
          return offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
        }
      })

      const { report } = await run({ fetchPage, readSlabs: readCharmander })

      expect(report.deals).toHaveLength(2)
      expect(report.problems).toEqual([])
      expect(calls.filter((url) => url.includes('cardmarket.com')).length).toBeGreaterThan(1)
    })
  })

  it('tries a plainer search when the one built from the slab finds nothing', async () => {
    const { fetchPage, calls } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      // Only the plainer query — the card number without its `#` — finds the page.
      google: (url) => (url.includes('%23168') ? '<html></html>' : googleResults('151', 'Charmander-MEW168')),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]?.query).not.toContain('#168')
    expect(calls.filter((url) => url.includes('google.com/search'))).toHaveLength(2)
  })

  it('does not price a card against a Cardmarket page for another card number', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: () => googleResults('151', 'Charmander'),
      offers: () =>
        offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }]).replace(
          '<body>',
          '<body><dl class="labeled"><dt class="col-6">Number</dt><dd class="col-6">4</dd></dl>'
        )
    })

    const { report } = await run({ fetchPage, readSlabs: readCharmander })

    expect(report.deals).toEqual([])
    expect(report.problems).toEqual([
      expect.objectContaining({
        stage: 'match',
        reason: 'The Cardmarket page Google found is a different card',
        detail: "Cardmarket's page is card 4, the slab is #168"
      })
    ])
  })

  describe('while the scan is still going', () => {
    it('searches Google for the next card while Cardmarket is still loading this one', async () => {
      let releaseOffers!: () => void
      const offersHeld = new Promise<void>((resolve) => {
        releaseOffers = resolve
      })
      const searched: string[] = []
      const { fetchPage } = fetcher({
        marktplaats: marktplaatsOverview([
          { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 },
          { id: 'm2', title: 'Pikachu 173/165 151 PSA 9', cents: 12000 }
        ]),
        google: (url) => {
          searched.push(url)
          return /pikachu/i.test(url) ? googleResults('151', 'Pikachu-MEW173') : googleResults('151', 'Charmander-MEW168')
        }
      })
      const held = vi.fn(async (url: string) => {
        if (url.includes('cardmarket.com')) {
          await offersHeld
          return offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
        }
        return fetchPage(url)
      })
      const readByTitle: SlabReader = async ({ listing }) => ({
        slabs: [listing.title.startsWith('Pikachu') ? slab({ cardName: 'PIKACHU', cardNumber: '173' }) : slab()],
        note: null
      })

      const scanning = run({ fetchPage: held, readSlabs: readByTitle })
      // Charmander's offers have not come back, and Pikachu is searched for all the same.
      await vi.waitFor(() => expect(searched).toHaveLength(2))
      releaseOffers()

      const { report } = await scanning
      expect(report.deals).toHaveLength(2)
    })

    it('shows what it has found before it has finished', async () => {
      let releaseSecond!: () => void
      const secondHeld = new Promise<void>((resolve) => {
        releaseSecond = resolve
      })
      const { fetchPage } = fetcher({
        marktplaats: marktplaatsOverview([
          { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 },
          { id: 'm2', title: 'Pikachu 173/165 151 PSA 9', cents: 12000 }
        ]),
        google: (url) => (/pikachu/i.test(url) ? googleResults('151', 'Pikachu-MEW173') : googleResults('151', 'Charmander-MEW168')),
        offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
      })
      const readByTitle: SlabReader = async ({ listing }) => {
        if (listing.title.startsWith('Pikachu')) {
          await secondHeld
          return { slabs: [slab({ cardName: 'PIKACHU', cardNumber: '173' })], note: null }
        }
        return { slabs: [slab()], note: null }
      }
      const seen: Array<{ checked: number; total: number; deals: string[] }> = []

      const scanning = run({
        fetchPage,
        readSlabs: readByTitle,
        onProgress: ({ report, checked, total }) => seen.push({ checked, total, deals: report.deals.map((deal) => deal.id) })
      })
      await vi.waitFor(() => expect(seen.at(-1)).toEqual({ checked: 1, total: 2, deals: ['marktplaats:m1'] }))
      releaseSecond()

      await scanning
      expect(seen.at(-1)).toEqual({ checked: 2, total: 2, deals: ['marktplaats:m1', 'marktplaats:m2'] })
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
    expect(report.errors[0]).toContain('No PSA label reader configured')
  })
})

describe('the card number a Cardmarket page prints', () => {
  it('reads it off the info block', () => {
    expect(
      cardmarketProductNumber(
        '<dl><dt class="col-6 col-xl-5">Rarity</dt><dd>Holo Rare</dd><dt class="col-6 col-xl-5">Number</dt><dd class="col-6 col-xl-7">049</dd></dl>'
      )
    ).toBe('049')
    expect(cardmarketProductNumber('<html><body>No info here</body></html>')).toBeNull()
  })

  it('compares numbers by their digits, whatever the set spells in front of them', () => {
    expect(numbersDisagree('049', '49')).toBe(false)
    expect(numbersDisagree('GG10', '10')).toBe(false)
    expect(numbersDisagree('SWSH282', '282')).toBe(false)
    expect(numbersDisagree('001/030', '1')).toBe(false)
    expect(numbersDisagree('4', '168')).toBe(true)
    expect(numbersDisagree('?', '168')).toBe(false)
  })
})

describe('Cardmarket versions of one card', () => {
  const SINGLES = 'https://www.cardmarket.com/en/Pokemon/Products/Singles'
  const VERSIONS_URL = 'https://www.cardmarket.com/en/Pokemon/Cards/Magneton/Versions'
  const VERSIONS_LINK = '<a href="/en/Pokemon/Cards/Magneton/Versions">Show Versions (21)</a>'
  /** Every printing of Magneton: the two SVP 159s, another promo, and a Magneton from a set. */
  const VERSIONS_PAGE = `<html>
    <a href="/en/Pokemon/Products/Singles/SV-Black-Star-Promos/Magneton-V1-SVP159">Magneton</a>
    <a href="/en/Pokemon/Products/Singles/SV-Black-Star-Promos/Magneton-V2-SVP159">Magneton</a>
    <a href="/en/Pokemon/Products/Singles/SV-Black-Star-Promos/Magneton-V3-SVP098">Magneton</a>
    <a href="/en/Pokemon/Products/Singles/Surging-Sparks/Magneton-SSP159">Magneton</a>
  </html>`

  it('only calls a product versioned when Cardmarket marked it so', () => {
    expect(isVersionedProduct(`${SINGLES}/SV-Black-Star-Promos/Magneton-V2-SVP159`)).toBe(true)
    expect(isVersionedProduct(`${SINGLES}/Surging-Sparks/Magneton-SSP159`)).toBe(false)
  })

  it('finds the versions list the product page links to', () => {
    expect(cardmarketVersionsUrl(`<html>${VERSIONS_LINK}</html>`)).toBe(VERSIONS_URL)
    expect(cardmarketVersionsUrl('<html><a href="/en/Pokemon/Cards/Magneton">Magneton</a></html>')).toBeNull()
  })

  it('takes only the versions that are this very card', () => {
    expect(sameCardVersions(VERSIONS_PAGE, `${SINGLES}/SV-Black-Star-Promos/Magneton-V2-SVP159`)).toEqual([
      `${SINGLES}/SV-Black-Star-Promos/Magneton-V1-SVP159`
    ])
  })

  // Magneton is not on the top-100 list, so the scan is shown a Pikachu that Cardmarket
  // sells the same way: two products of one card number, one of them stamped.
  const PIKACHU_VERSIONS_URL = 'https://www.cardmarket.com/en/Pokemon/Cards/Pikachu/Versions'
  const PIKACHU_VERSIONS_LINK = '<a href="/en/Pokemon/Cards/Pikachu/Versions">Show Versions (80)</a>'
  const PIKACHU_VERSIONS_PAGE = VERSIONS_PAGE.replace(/Magneton/g, 'Pikachu')

  const versionedSlab: SlabReader = async () => ({
    slabs: [
      slab({
        year: '2024',
        setLine: 'POKEMON SVP EN',
        cardName: 'PIKACHU',
        varietyLine: 'SURGING SPARKS ETB',
        cardNumber: '159',
        grade: 10
      })
    ],
    note: null
  })

  function versionedFetcher(v1Offers: string) {
    return fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Pikachu Surging Sparks Psa 10', cents: 14995 }]),
      google: () => googleResults('SV-Black-Star-Promos', 'Pikachu-V2-SVP159'),
      offers: (url) => {
        if (url.startsWith(PIKACHU_VERSIONS_URL)) return PIKACHU_VERSIONS_PAGE
        if (url.includes('Pikachu-V1-SVP159')) return v1Offers
        // The stamped one, which Google happened to put first.
        return offersPage([{ seller: 'shop', comment: 'PSA 10', price: '275,45 €' }]).replace('</body>', `${PIKACHU_VERSIONS_LINK}</body>`)
      }
    })
  }

  it('prices a card Cardmarket sells more than once against the cheapest version', async () => {
    const { fetchPage } = versionedFetcher(offersPage([{ seller: 'shop', comment: 'PSA 10', price: '190,00 €' }]))

    const { report } = await run({ fetchPage, readSlabs: versionedSlab, sources: ['marktplaats'] })

    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]).toMatchObject({ valuation: { expectedSale: 190 }, edge: 28.55 })
    expect(report.deals[0]?.cardmarketUrl).toContain('/SV-Black-Star-Promos/Pikachu-V1-SVP159')
  })

  it('does not price it at all when one of the versions has nothing to price it by', async () => {
    const { fetchPage } = versionedFetcher(offersPage([{ seller: 'shop', comment: 'Near Mint', price: '40,00 €' }]))

    const { report } = await run({ fetchPage, readSlabs: versionedSlab, sources: ['marktplaats'] })

    expect(report.deals).toHaveLength(0)
    expect(report.noComps[0]?.reason).toBe('Cardmarket sells 2 versions of this card, and not every one has a PSA 10 to price it by')
  })
})

describe('the top list', () => {
  it('never opens a listing whose title names a Pokémon off the list', async () => {
    const { fetchPage, calls } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: "Team Rocket's Nidoking ex PSA 10", cents: 9000 }])
    })
    const readSlabs = vi.fn(readCharmander)

    const { report } = await run({ fetchPage, readSlabs, sources: ['marktplaats'] })

    expect(report.outOfScope).toBe(1)
    expect(readSlabs).not.toHaveBeenCalled()
    expect(calls.some((url) => url.includes('marktplaats.nl/v/'))).toBe(false)
  })

  it('drops a card whose slab names a Pokémon off the list, when the title named none', async () => {
    const { fetchPage, calls } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Mooie PSA 10 slab', cents: 9000 }])
    })
    const readSlabs: SlabReader = async () => ({ slabs: [slab({ cardName: 'NIDOKING', cardNumber: '034', grade: 10 })], note: null })

    const { report } = await run({ fetchPage, readSlabs, sources: ['marktplaats'] })

    expect(report.outOfScope).toBe(1)
    expect(report.deals).toEqual([])
    expect(calls.some((url) => url.includes('google.com/search'))).toBe(false)
  })

  it('lends a misread slab the name its title gives, when the slab names no Pokémon at all', async () => {
    const { fetchPage } = fetcher({
      marktplaats: marktplaatsOverview([{ id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 }]),
      google: (url) => (decodeURIComponent(url).includes('Charmander') ? googleResults('151', 'Charmander-V2-MEW168') : '<html></html>'),
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    const readSlabs: SlabReader = async () => ({ slabs: [slab({ cardName: 'STARURIVERDEE' })], note: null })

    const { report } = await run({ fetchPage, readSlabs, sources: ['marktplaats'] })

    // The name the title gives, set and all — enough for Google to find the card by.
    expect(report.deals.map((deal) => deal.card.name)).toEqual(['Charmander 151'])
  })
})

describe('pricing against every site', () => {
  const NOW = new Date('2026-10-07T12:00:00.000Z')
  const CANDIDATE = { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 10000 }
  const OWN_AD = 'https://www.marktplaats.nl/v/verzamelen/m2000001-charmander'

  /** The deal search answers the feed; the comparison search for the card answers everyone selling it. */
  function comparing(google: (url: string) => string = () => googleResults('151', 'Charmander-V2-MEW168')) {
    const base = fetcher({
      marktplaats: marktplaatsOverview([CANDIDATE]),
      google,
      offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
    })
    const competition = marktplaatsOverview([
      // The listing itself and our own ad turn up in the search too; neither is competition.
      CANDIDATE,
      { id: 'm2000001', title: 'Charmander 168/165 PSA 9', cents: 9500 },
      { id: 'm7', title: 'Charmander 168/165 PSA 9', cents: 14000, date: '3 okt 26' },
      { id: 'm8', title: 'Charmander 168/165 PSA 10', cents: 30000 }
    ])
    const fetchPage = vi.fn(async (url: string) => (url.includes('query=Charmander') ? competition : base.fetchPage(url)))
    return { fetchPage, calls: base.calls }
  }

  const vintedMemory = () =>
    inMemoryMarketMemory([
      {
        id: 'vinted:5',
        source: 'vinted',
        title: 'Charmander 168/165 PSA 9',
        ask: 152.6,
        sellerAsk: 145,
        url: 'https://www.vinted.nl/items/5',
        firstSeen: '2026-10-05T12:00:00.000Z',
        lastSeen: '2026-10-05T12:00:00.000Z'
      }
    ])

  const ebayItem: EbayItem = {
    itemId: 'v1|9|0',
    title: 'PSA 9 Charmander 168/165 151 Pokemon Karte',
    price: 150,
    currency: 'EUR',
    shipping: 10,
    url: 'https://www.ebay.de/itm/9',
    seller: 'kartenladen',
    country: 'DE'
  }

  it('sells a card at the cheapest believable competitor on any site', async () => {
    const { fetchPage } = comparing()
    const ebay = vi.fn(async () => [ebayItem])

    const { report } = await run({
      fetchPage,
      readSlabs: readCharmander,
      sources: ['marktplaats'],
      now: NOW,
      ownListings: [{ marktplaatsUrl: OWN_AD }],
      comparisons: { marktplaats: true, ebay, memory: vintedMemory() }
    })

    expect(ebay).toHaveBeenCalledWith('Charmander 168 PSA 9')
    expect(report.deals).toHaveLength(1)
    const deal = report.deals[0]!
    // €100 plus €5 Kopersbescherming and €4 postage, against the €140 Marktplaats ask.
    expect(deal.cost.total).toBe(109)
    expect(deal.edge).toBe(31)
    expect(deal.valuation).toMatchObject({ expectedSale: 140, confidence: 'strong', basis: { id: 'marktplaats:m7' } })
    expect(deal.valuation.summary).toBe('Cardmarket from €170 · Marktplaats from €140 · Vinted from €145 · eBay EU from €160')
    expect(deal.soldSearchUrl).toContain('ebay.de')
  })

  it('still prices a card Cardmarket has no page for, against the other sites', async () => {
    const { fetchPage } = comparing(() => '<html></html>')

    const { report } = await run({
      fetchPage,
      readSlabs: readCharmander,
      sources: ['marktplaats'],
      now: NOW,
      ownListings: [{ marktplaatsUrl: OWN_AD }],
      comparisons: { marktplaats: true, memory: vintedMemory() }
    })

    expect(report.problems).toEqual([])
    expect(report.deals).toHaveLength(1)
    expect(report.deals[0]).toMatchObject({ cardmarketUrl: null, valuation: { expectedSale: 140 } })
    expect(report.deals[0]?.valuation.perSource[0]).toMatchObject({
      source: 'cardmarket',
      count: 0,
      note: 'No matching Cardmarket page in the Google results'
    })
  })

  it('asks Marktplaats about a card once however many listings show it', async () => {
    const { fetchPage } = comparing()
    const first = await run({
      fetchPage,
      readSlabs: readCharmander,
      sources: ['marktplaats'],
      now: NOW,
      comparisons: { marktplaats: true }
    })
    await run({
      fetchPage,
      readSlabs: readCharmander,
      sources: ['marktplaats'],
      now: NOW,
      cache: first.cache,
      comparisons: { marktplaats: true }
    })

    expect(fetchPage.mock.calls.filter(([url]) => url.includes('query=Charmander'))).toHaveLength(1)
  })

  it('says what is not set up', async () => {
    const { fetchPage } = comparing()
    const { report } = await run({
      fetchPage,
      readSlabs: readCharmander,
      sources: ['marktplaats'],
      now: NOW,
      comparisons: { marktplaats: true }
    })

    expect(report.errors).toEqual([
      'PSA cert lookups are off, so slabs are identified from the photo alone. Add PSA_API_TOKEN to .dev.vars.',
      'eBay is not set up, so the European market is left out. Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to .dev.vars.'
    ])
  })

  it('remembers every listing on the search pages for later scans', async () => {
    const { fetchPage } = comparing()
    const memory = inMemoryMarketMemory()

    await run({ fetchPage, readSlabs: readCharmander, sources: ['marktplaats'], now: NOW, comparisons: { marktplaats: true, memory } })

    expect((await memory.seenSince('marktplaats', '2026-10-01T00:00:00.000Z')).map((row) => row.id)).toEqual(['marktplaats:m1'])
  })
})

describe('PSA cert lookups', () => {
  const pages = {
    marktplaats: marktplaatsOverview([
      { id: 'm1', title: 'Charmander 168/165 151 PSA 9', cents: 12000 },
      { id: 'm2', title: 'Charmander 168/165 PSA 9', cents: 12500 }
    ]),
    google: () => googleResults('151', 'Charmander-V2-MEW168'),
    offers: () => offersPage([{ seller: 'shop', comment: 'PSA 9', price: '170,00 €' }])
  }

  it('looks a cert up once, however many listings and scans show it', async () => {
    const lookupCert = vi.fn(async () => slab())

    const first = await run({ fetchPage: fetcher(pages).fetchPage, readSlabs: readCharmander, lookupCert, sources: ['marktplaats'] })
    const fresh = { ...first.cache, entries: {} }
    await run({ fetchPage: fetcher(pages).fetchPage, readSlabs: readCharmander, lookupCert, sources: ['marktplaats'], cache: fresh })

    expect(lookupCert).toHaveBeenCalledTimes(1)
    expect(first.cache.certs?.['99887766']?.label?.cardName).toBe('CHARMANDER')
  })

  it('stops for the day before PSA’s free allowance runs out', async () => {
    const now = new Date('2026-10-07T12:00:00.000Z')
    const spent = Object.fromEntries(
      Array.from({ length: 90 }, (_, index) => [`5000${index}`, { label: null, at: '2026-10-07T08:00:00.000Z' }])
    )
    const cache: DealFinderCache = { version: CACHE_VERSION, entries: {}, products: {}, floors: {}, certs: spent, comps: {} }
    const lookupCert = vi.fn(async () => slab())

    const { report } = await run({
      fetchPage: fetcher(pages).fetchPage,
      readSlabs: readCharmander,
      lookupCert,
      sources: ['marktplaats'],
      cache,
      now
    })

    expect(lookupCert).not.toHaveBeenCalled()
    // The slab read off the photo is still enough to price the card.
    expect(report.deals.length).toBeGreaterThan(0)
  })
})
