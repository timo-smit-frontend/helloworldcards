import { CARD_LANGUAGES, type CardGrader, type CardLanguage } from '~/database/products'
import { parseListedPrice } from './price'
import { applyPriceRangeSearchParams, type PriceRange } from './productPriceFilter'

export const PRODUCT_SORTS = ['title-asc', 'age-asc', 'age-desc', 'price-asc', 'price-desc'] as const

export type ProductSort = (typeof PRODUCT_SORTS)[number]

export const DEFAULT_PRODUCT_SORT: ProductSort = 'title-asc'

export const CATALOG_PAGE_SIZE = 12
export const CATALOG_PAGE_SIZE_NARROW = 8

export type CatalogProduct = {
  id: number
  title: string
  price?: string | number
  language?: CardLanguage
  grader?: CardGrader
  year?: number
}

export type CatalogQuery = {
  language?: CardLanguage | null
  sort?: ProductSort | null
  range?: PriceRange | null
  priceActive?: boolean
}

type FilterStatus = 'match' | 'empty' | 'exclude' | 'skip'

function parseChoice<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

export function parseCatalogSearchParams(searchParams: URLSearchParams): {
  language: CardLanguage | null
  sort: ProductSort
} {
  return {
    language: parseChoice(searchParams.get('language'), CARD_LANGUAGES),
    sort: parseChoice(searchParams.get('sort'), PRODUCT_SORTS) ?? DEFAULT_PRODUCT_SORT
  }
}

export function applyCatalogSearchParams(
  current: URLSearchParams,
  query: { language: CardLanguage | null; sort: ProductSort | null }
): URLSearchParams {
  const params = new URLSearchParams(current)

  if (query.language) {
    params.set('language', query.language)
  } else {
    params.delete('language')
  }

  params.delete('grader')
  params.delete('page')

  if (query.sort && query.sort !== DEFAULT_PRODUCT_SORT) {
    params.set('sort', query.sort)
  } else {
    params.delete('sort')
  }

  return params
}

export function catalogFiltersActive(query: { language?: CardLanguage | null; sort?: ProductSort | null; priceActive?: boolean }): boolean {
  return query.language != null || query.priceActive === true || (query.sort != null && query.sort !== DEFAULT_PRODUCT_SORT)
}

export function resetCatalogSearchParams(current: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(current)
  params.delete('language')
  params.delete('grader')
  params.delete('sort')
  params.delete('min')
  params.delete('max')
  params.delete('page')
  return params
}

export function parseCatalogPageParam(searchParams: URLSearchParams): number {
  const parsed = Number(searchParams.get('page'))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export function applyCatalogPageSearchParams(current: URLSearchParams, page: number): URLSearchParams {
  const params = new URLSearchParams(current)

  if (page > 1) {
    params.set('page', String(page))
  } else {
    params.delete('page')
  }

  return params
}

export function paginateCatalogProducts<T>(
  products: T[],
  page: number,
  pageSize: number
): { items: T[]; page: number; totalPages: number; total: number } {
  const total = products.length
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  const safePage = Math.min(totalPages, Math.max(1, page))
  const start = (safePage - 1) * pageSize

  return {
    items: products.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total
  }
}

export function applyCatalogListingParams(
  current: URLSearchParams,
  query: { language: CardLanguage | null; sort: ProductSort | null; range?: PriceRange | null },
  bounds?: PriceRange | null
): URLSearchParams {
  const catalogParams = applyCatalogSearchParams(current, {
    language: query.language,
    sort: query.sort
  })

  if (bounds != null && query.range != null) {
    return applyPriceRangeSearchParams(catalogParams, query.range, bounds)
  }

  catalogParams.delete('min')
  catalogParams.delete('max')
  return catalogParams
}

function priceStatus(product: CatalogProduct, query: CatalogQuery): FilterStatus {
  if (!query.priceActive || query.range == null) {
    return 'skip'
  }

  const price = parseListedPrice(product.price)
  if (price == null) {
    return 'empty'
  }

  return price >= query.range.min && price <= query.range.max ? 'match' : 'exclude'
}

function fieldStatus<T>(value: T | undefined, selected: T | null | undefined): FilterStatus {
  if (selected == null) {
    return 'skip'
  }

  if (value == null) {
    return 'empty'
  }

  return value === selected ? 'match' : 'exclude'
}

function classify(product: CatalogProduct, query: CatalogQuery): 'match' | 'empty' | 'exclude' {
  const statuses = [priceStatus(product, query), fieldStatus(product.language, query.language)]

  if (statuses.includes('exclude')) {
    return 'exclude'
  }

  if (statuses.includes('empty')) {
    return 'empty'
  }

  return 'match'
}

function compareNullableNumber(left: number | null | undefined, right: number | null | undefined, descending: boolean): number {
  if (left == null && right == null) {
    return 0
  }

  if (left == null) {
    return 1
  }

  if (right == null) {
    return -1
  }

  return descending ? right - left : left - right
}

function compareCatalogProducts(left: CatalogProduct, right: CatalogProduct, sort: ProductSort | null | undefined): number {
  if (sort === 'title-asc') {
    return left.title.localeCompare(right.title, 'en')
  }

  if (sort === 'age-asc' || sort === 'age-desc') {
    return compareNullableNumber(left.year, right.year, sort === 'age-desc')
  }

  if (sort === 'price-asc' || sort === 'price-desc') {
    return compareNullableNumber(parseListedPrice(left.price), parseListedPrice(right.price), sort === 'price-desc')
  }

  return 0
}

export function listCatalogProducts<T extends CatalogProduct>(products: T[], query: CatalogQuery = {}): T[] {
  const matched: T[] = []
  const empty: T[] = []

  for (const product of products) {
    const status = classify(product, query)
    if (status === 'exclude') {
      continue
    }

    if (status === 'empty') {
      empty.push(product)
    } else {
      matched.push(product)
    }
  }

  const sort = query.sort ?? DEFAULT_PRODUCT_SORT
  matched.sort((left, right) => compareCatalogProducts(left, right, sort))
  empty.sort((left, right) => compareCatalogProducts(left, right, sort))

  return [...matched, ...empty]
}
