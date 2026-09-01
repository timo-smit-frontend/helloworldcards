import { describe, expect, it } from 'vitest'
import {
  applyCatalogListingParams,
  applyCatalogSearchParams,
  applyCatalogPageSearchParams,
  CATALOG_PAGE_SIZE,
  CATALOG_PAGE_SIZE_NARROW,
  catalogFiltersActive,
  listCatalogProducts,
  paginateCatalogProducts,
  parseCatalogPageParam,
  parseCatalogSearchParams,
  resetCatalogSearchParams,
  type CatalogProduct
} from '~/services/productCatalog'

const sample: CatalogProduct[] = [
  { id: 1, title: 'Mewtwo', price: '€95', language: 'english', grader: 'psa', year: 2016 },
  { id: 2, title: 'Zorua AR', price: '€65', language: 'japanese', grader: 'beckett', year: 2025 },
  { id: 3, title: 'Binder' }
]

describe('parseCatalogSearchParams', () => {
  it('reads language and sort from the query string', () => {
    expect(parseCatalogSearchParams(new URLSearchParams('language=english&sort=price-desc'))).toEqual({
      language: 'english',
      sort: 'price-desc'
    })
  })

  it('ignores unknown filter values and leftover grader params', () => {
    expect(parseCatalogSearchParams(new URLSearchParams('language=french&grader=psa&sort=title-desc'))).toEqual({
      language: null,
      sort: 'title-asc'
    })
  })

  it('defaults order to A to Z when sort is missing', () => {
    expect(parseCatalogSearchParams(new URLSearchParams()).sort).toBe('title-asc')
  })
})

describe('applyCatalogSearchParams', () => {
  it('writes only the selected catalog filters and drops grader', () => {
    const params = applyCatalogSearchParams(new URLSearchParams('min=50&grader=psa&page=3'), {
      language: 'japanese',
      sort: 'age-desc'
    })

    expect(params.get('min')).toBe('50')
    expect(params.get('language')).toBe('japanese')
    expect(params.get('grader')).toBeNull()
    expect(params.get('sort')).toBe('age-desc')
    expect(params.get('page')).toBeNull()
  })

  it('omits the default A to Z order from the query string', () => {
    const params = applyCatalogSearchParams(new URLSearchParams('sort=price-desc'), {
      language: null,
      sort: 'title-asc'
    })

    expect(params.get('sort')).toBeNull()
  })
})

describe('catalogFiltersActive', () => {
  it('is off for the default listing', () => {
    expect(catalogFiltersActive({ language: null, sort: 'title-asc' })).toBe(false)
  })

  it('is on when language, price, or a non-default order is set', () => {
    expect(catalogFiltersActive({ language: 'english', sort: 'title-asc' })).toBe(true)
    expect(catalogFiltersActive({ language: null, sort: 'title-asc', priceActive: true })).toBe(true)
    expect(catalogFiltersActive({ language: null, sort: 'price-desc' })).toBe(true)
  })
})

describe('resetCatalogSearchParams', () => {
  it('clears catalog and price filters from the query string', () => {
    const params = resetCatalogSearchParams(new URLSearchParams('language=japanese&grader=psa&sort=price-desc&min=50&max=90&page=3'))

    expect(params.toString()).toBe('')
  })
})

describe('applyCatalogListingParams', () => {
  it('writes language, order, and price together', () => {
    const params = applyCatalogListingParams(
      new URLSearchParams('language=english&min=45&page=2'),
      {
        language: 'japanese',
        sort: 'price-desc',
        range: { min: 60, max: 100 }
      },
      { min: 45, max: 125 }
    )

    expect(params.get('language')).toBe('japanese')
    expect(params.get('sort')).toBe('price-desc')
    expect(params.get('min')).toBe('60')
    expect(params.get('max')).toBe('100')
    expect(params.get('page')).toBeNull()
  })

  it('clears previous listing filters when the draft is the default', () => {
    const params = applyCatalogListingParams(
      new URLSearchParams('language=english&sort=price-desc&min=60&max=100'),
      {
        language: null,
        sort: 'title-asc',
        range: { min: 45, max: 125 }
      },
      { min: 45, max: 125 }
    )

    expect(params.toString()).toBe('')
  })
})

describe('listCatalogProducts', () => {
  it('keeps items without language or price at the end when a filter is on', () => {
    expect(listCatalogProducts(sample, { language: 'english' }).map((product) => product.id)).toEqual([1, 3])
    expect(listCatalogProducts(sample, { range: { min: 50, max: 90 }, priceActive: true }).map((product) => product.id)).toEqual([2, 3])
  })

  it('hides items that have a conflicting language', () => {
    expect(listCatalogProducts(sample, { language: 'japanese' }).map((product) => product.id)).toEqual([2, 3])
  })

  it('sorts matching items first, then empty ones', () => {
    expect(listCatalogProducts(sample, { language: 'english', sort: 'title-asc' }).map((product) => product.title)).toEqual([
      'Mewtwo',
      'Binder'
    ])
  })

  it('defaults to A to Z', () => {
    expect(listCatalogProducts(sample).map((product) => product.title)).toEqual(['Binder', 'Mewtwo', 'Zorua AR'])
  })

  it('sorts by age, with missing years last', () => {
    expect(listCatalogProducts(sample, { sort: 'age-asc' }).map((product) => product.title)).toEqual(['Mewtwo', 'Zorua AR', 'Binder'])
    expect(listCatalogProducts(sample, { sort: 'age-desc' }).map((product) => product.title)).toEqual(['Zorua AR', 'Mewtwo', 'Binder'])
  })

  it('sorts by price, with missing prices last', () => {
    expect(listCatalogProducts(sample, { sort: 'price-asc' }).map((product) => product.title)).toEqual(['Zorua AR', 'Mewtwo', 'Binder'])
    expect(listCatalogProducts(sample, { sort: 'price-desc' }).map((product) => product.title)).toEqual(['Mewtwo', 'Zorua AR', 'Binder'])
  })
})

const paged: CatalogProduct[] = [
  { id: 1, title: 'Arceus V', language: 'english' },
  { id: 2, title: 'Charizard', language: 'english' },
  { id: 3, title: 'Ekans', language: 'english' },
  { id: 4, title: 'Lugia V', language: 'english' },
  { id: 5, title: 'Mega Latias ex', language: 'english' },
  { id: 6, title: 'Mewtwo', language: 'english' },
  { id: 7, title: 'Zekrom', language: 'english' },
  { id: 8, title: 'Zorua AR', language: 'japanese' }
]

describe('parseCatalogPageParam', () => {
  it('defaults to page 1', () => {
    expect(parseCatalogPageParam(new URLSearchParams())).toBe(1)
    expect(parseCatalogPageParam(new URLSearchParams('page=foo'))).toBe(1)
    expect(parseCatalogPageParam(new URLSearchParams('page=0'))).toBe(1)
  })

  it('reads a positive page from the query string', () => {
    expect(parseCatalogPageParam(new URLSearchParams('page=2'))).toBe(2)
  })
})

describe('applyCatalogPageSearchParams', () => {
  it('omits the first page from the query string', () => {
    const params = applyCatalogPageSearchParams(new URLSearchParams('language=english&page=2'), 1)
    expect(params.get('page')).toBeNull()
    expect(params.get('language')).toBe('english')
  })

  it('writes later pages', () => {
    expect(applyCatalogPageSearchParams(new URLSearchParams(), 2).get('page')).toBe('2')
  })
})

describe('catalog page sizes', () => {
  it('shows 12 products above sm and 8 below', () => {
    expect(CATALOG_PAGE_SIZE).toBe(12)
    expect(CATALOG_PAGE_SIZE_NARROW).toBe(8)
  })
})

describe('paginateCatalogProducts', () => {
  it('slices the filtered list into pages of 4', () => {
    const listed = listCatalogProducts(paged, { language: 'english' })
    expect(listed.map((product) => product.title)).toEqual([
      'Arceus V',
      'Charizard',
      'Ekans',
      'Lugia V',
      'Mega Latias ex',
      'Mewtwo',
      'Zekrom'
    ])

    expect(paginateCatalogProducts(listed, 1, 4).items.map((product) => product.title)).toEqual([
      'Arceus V',
      'Charizard',
      'Ekans',
      'Lugia V'
    ])
    expect(paginateCatalogProducts(listed, 2, 4)).toEqual({
      items: [
        { id: 5, title: 'Mega Latias ex', language: 'english' },
        { id: 6, title: 'Mewtwo', language: 'english' },
        { id: 7, title: 'Zekrom', language: 'english' }
      ],
      page: 2,
      totalPages: 2,
      total: 7
    })
  })

  it('clamps a page that is past the last filtered page', () => {
    const listed = listCatalogProducts(paged, { language: 'japanese' })
    expect(paginateCatalogProducts(listed, 4, 4)).toEqual({
      items: [{ id: 8, title: 'Zorua AR', language: 'japanese' }],
      page: 1,
      totalPages: 1,
      total: 1
    })
  })
})
