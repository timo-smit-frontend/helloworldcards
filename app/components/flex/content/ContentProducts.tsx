import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import Image from '~/components/elements/Image'
import Pokemon from '~/components/elements/Pokemon'
import { ProductCatalogFilterFields, ProductCatalogFilterSheet, ProductCatalogPagination } from '~/components/elements/ProductFiltering'
import type { Product } from '~/database/products'
import useCatalogPageSize from '~/hooks/useCatalogPageSize'
import useLocationFinder from '~/hooks/useLocationFinder'
import {
  applyCatalogPageSearchParams,
  applyCatalogSearchParams,
  catalogFiltersActive,
  listCatalogProducts,
  paginateCatalogProducts,
  parseCatalogPageParam,
  parseCatalogSearchParams,
  resetCatalogSearchParams
} from '~/services/productCatalog'
import { applyPriceRangeSearchParams, catalogPriceBounds, parsePriceRangeParams, type PriceRange } from '~/services/productPriceFilter'
import { CATALOG_IMAGE_SIZES } from '~/services/responsiveImage'
import { cn } from '~/services/utils'

const productDelays = [
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000
] as const

function normalizeIds(id?: string | number | Array<string | number>): Array<string | number> | undefined {
  if (id == null) return undefined
  return Array.isArray(id) ? id : [id]
}

export default function ContentProducts({
  title,
  description,
  id,
  random,
  products: provided
}: {
  title?: string
  description?: string
  id?: string | number | Array<string | number>
  random?: number
  products?: Product[]
}) {
  const { ref, isFirst } = useLocationFinder()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageSize = useCatalogPageSize()
  const ids = normalizeIds(id)
  const showFilters = ids == null && random == null
  const products = useMemo(() => {
    const catalogProducts = provided ?? []
    if (ids) {
      const byId = new Map(catalogProducts.map((product) => [String(product.id), product]))
      return ids.map((value) => byId.get(String(value))).filter((product): product is Product => product != null)
    }
    if (random != null) {
      return catalogProducts.slice(0, random)
    }
    return catalogProducts
  }, [random, ids, provided])
  const bounds = useMemo(() => (showFilters ? catalogPriceBounds(products) : null), [products, showFilters])
  const range = bounds ? parsePriceRangeParams(searchParams, bounds) : null
  const catalog = parseCatalogSearchParams(searchParams)
  const requestedPage = parseCatalogPageParam(searchParams)
  const priceActive = bounds != null && range != null && (range.min > bounds.min || range.max < bounds.max)
  const filtersActive = catalogFiltersActive({ ...catalog, priceActive })
  const listedProducts = showFilters ? listCatalogProducts(products, { ...catalog, range, priceActive }) : products
  const paged = showFilters ? paginateCatalogProducts(listedProducts, requestedPage, pageSize) : null
  const visibleProducts = paged?.items ?? listedProducts
  const Heading = ids || random != null ? 'h2' : 'h1'

  useEffect(() => {
    if (!showFilters || paged == null || paged.page === requestedPage) {
      return
    }

    setSearchParams(applyCatalogPageSearchParams(searchParams, paged.page), { replace: true })
  }, [paged, requestedPage, searchParams, setSearchParams, showFilters])

  function handlePriceRangeChange(next: PriceRange) {
    if (!bounds) return
    setSearchParams(applyPriceRangeSearchParams(searchParams, next, bounds), { replace: true })
  }

  function handlePageChange(page: number) {
    setSearchParams(applyCatalogPageSearchParams(searchParams, page), { replace: true })
    document.getElementById('content-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleCatalogChange(next: Partial<typeof catalog>) {
    setSearchParams(
      applyCatalogSearchParams(searchParams, {
        language: next.language !== undefined ? next.language : catalog.language,
        sort: next.sort !== undefined ? next.sort : catalog.sort
      }),
      { replace: true }
    )
  }

  return (
    <section id="content-products" ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div className={cn('flex flex-col gap-10', showFilters && 'max-lg:pb-20')}>
          {(title || description) && (
            <div className="flex max-w-4xl flex-col gap-8">
              {isFirst && <Breadcrumbs />}
              {(title || description) && (
                <div className="flex flex-col gap-2 lg:gap-4">
                  {title && (
                    <Animated delay={100}>
                      <Heading className="title-l">{title}</Heading>
                    </Animated>
                  )}
                  {description && (
                    <Animated delay={200}>
                      <p className="content-l text-site-mantle">{description}</p>
                    </Animated>
                  )}
                </div>
              )}
            </div>
          )}

          {showFilters && (
            <>
              <Animated delay={300}>
                <div className="hidden grid-cols-1 gap-5 sm:grid-cols-2 lg:grid lg:grid-cols-4">
                  <ProductCatalogFilterFields
                    idPrefix="product"
                    bounds={bounds}
                    range={range}
                    language={catalog.language}
                    sort={catalog.sort}
                    onRangeChange={handlePriceRangeChange}
                    onLanguageChange={(next) => handleCatalogChange({ language: next })}
                    onSortChange={(next) => handleCatalogChange({ sort: next })}
                  />
                  <div className="min-w-0">
                    {filtersActive && (
                      <div className="flex w-full min-w-0 flex-col gap-3">
                        <span className="invisible text-sm font-medium" aria-hidden>
                          Reset
                        </span>
                        <button
                          type="button"
                          className="button-green w-full! cursor-pointer"
                          onClick={() => setSearchParams(resetCatalogSearchParams(searchParams), { replace: true })}
                        >
                          Reset filters
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Animated>
              <ProductCatalogFilterSheet
                bounds={bounds}
                range={range}
                language={catalog.language}
                sort={catalog.sort}
                searchParams={searchParams}
                onApply={(next) => setSearchParams(next, { replace: true })}
              />
            </>
          )}

          {listedProducts.length > 0 ? (
            <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {visibleProducts.map((product, index) => (
                <li key={product.id} className="flex w-full min-w-0">
                  <Animated delay={productDelays[Math.min(index, productDelays.length - 1)]} className="flex w-full min-w-0">
                    <div className="flex w-full min-w-0 flex-1 flex-col">
                      <Link
                        to={`/products/${product.slug}/`}
                        className="group flex flex-1 flex-col overflow-hidden rounded-panel bg-site-gunmetal shadow-card ring-1 ring-site-mulled-wine smooth hover:-translate-y-0.5 hover:shadow-md hover:ring-site-envy"
                      >
                        <div className="relative sm:aspect-5/7 aspect-square w-full shrink-0 overflow-hidden bg-site-mid">
                          {product.images[0] ? (
                            <>
                              <Image
                                src={product.images[0]}
                                alt=""
                                title=""
                                width={800}
                                height={1120}
                                aria-hidden
                                sizes={CATALOG_IMAGE_SIZES}
                                maxwidth={600}
                                className={
                                  product.images[1] ? 'product-hover-morph-front' : 'absolute inset-0 size-full object-contain p-5'
                                }
                              />
                              {product.images[1] && (
                                <Image
                                  src={product.images[1]}
                                  alt=""
                                  title=""
                                  width={800}
                                  height={1120}
                                  aria-hidden
                                  sizes={CATALOG_IMAGE_SIZES}
                                  maxwidth={600}
                                  className="product-hover-morph-back"
                                />
                              )}
                            </>
                          ) : (
                            <Pokemon variant="placeholder" id={product.pokemonId} className="absolute inset-0 size-full" />
                          )}
                        </div>
                        <div className="flex flex-col gap-1 border-t border-site-mulled-wine px-4 py-3">
                          {product.subtitle && <span className="text-sm leading-snug text-site-mantle">{product.subtitle}</span>}
                          <span className="text-lg font-semibold text-site-gray-nurse">{product.title}</span>
                          {product.price != null && <span className="text-sm font-semibold text-site-summer-green">{product.price}</span>}
                        </div>
                      </Link>
                    </div>
                  </Animated>
                </li>
              ))}
            </ul>
          ) : null}
          {showFilters && paged && paged.totalPages > 1 && (
            <ProductCatalogPagination page={paged.page} totalPages={paged.totalPages} onPageChange={handlePageChange} />
          )}
          {listedProducts.length === 0 && products.length > 0 && (
            <Animated delay={300}>
              <p className="content-m text-site-mantle">No products match those filters.</p>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
