import { Link } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import Image from '~/components/elements/Image'
import Pokemon from '~/components/elements/Pokemon'
import { getAllProducts, getProductsByIds } from '~/database/products'
import useLocationFinder from '~/hooks/useLocationFinder'
import { imageTitleFor } from '~/services/imageCopy'
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
  id
}: {
  title?: string
  description?: string
  id?: string | number | Array<string | number>
}) {
  const { ref, isFirst } = useLocationFinder()
  const ids = normalizeIds(id)
  const products = ids ? getProductsByIds(ids) : getAllProducts()
  const Heading = ids ? 'h2' : 'h1'

  return (
    <section id="content-products" ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div className="flex flex-col gap-10">
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

          {products.length > 0 && (
            <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product, index) => (
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
                                title={imageTitleFor(product.images[0]) ?? product.title}
                                width={800}
                                height={1120}
                                aria-hidden
                                maxwidth={1000}
                                className={`absolute inset-0 size-full object-contain p-5 ${product.images[1] ? 'smooth group-hover:opacity-0' : ''}`}
                              />
                              {product.images[1] && (
                                <Image
                                  src={product.images[1]}
                                  alt=""
                                  title={imageTitleFor(product.images[1]) ?? `${product.title}, photo 2`}
                                  width={800}
                                  height={1120}
                                  aria-hidden
                                  className="absolute inset-0 size-full object-contain p-5 opacity-0 smooth group-hover:opacity-100"
                                  maxwidth={1000}
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
          )}
        </div>
      </div>
    </section>
  )
}
