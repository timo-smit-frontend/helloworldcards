import { Link } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import { getAllProducts, getProductsByIds } from '~/database/products'

const productDelays = [100, 200, 300, 400, 500, 600] as const

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
  const ids = normalizeIds(id)
  const products = ids ? getProductsByIds(ids) : getAllProducts()

  return (
    <section id="content-products" className="section">
      <div className="container-full">
        <div className="flex flex-col gap-10">
          {(title || description) && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              {title && (
                <Animated delay={100}>
                  <h2 className="title-l">{title}</h2>
                </Animated>
              )}
              {description && (
                <Animated delay={200}>
                  <p className="content-s text-muted">{description}</p>
                </Animated>
              )}
            </div>
          )}

          {products.length > 0 && (
            <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product, index) => (
                <li key={product.id}>
                  <Animated delay={productDelays[index % productDelays.length]}>
                    <div className="h-full">
                      <Link
                        to={`/products/${product.slug}`}
                        className="group flex h-full flex-col overflow-hidden rounded-panel bg-cream shadow-card ring-1 ring-line smooth hover:-translate-y-0.5 hover:shadow-md hover:ring-leaf"
                      >
                        <div className="relative aspect-4/5 bg-white p-5">
                          {product.images[0] && (
                            <img
                              src={product.images[0]}
                              alt={product.title}
                              className={`size-full object-contain ${product.images[1] ? 'smooth group-hover:opacity-0' : ''}`}
                            />
                          )}
                          {product.images[1] && (
                            <img
                              src={product.images[1]}
                              alt=""
                              aria-hidden
                              className="absolute inset-5 size-[calc(100%-2.5rem)] object-contain opacity-0 smooth group-hover:opacity-100"
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1 border-t border-line px-4 py-3">
                          <span className="text-sm leading-snug text-muted">{product.description}</span>
                          <span className="font-display text-lg font-semibold text-ink">{product.title}</span>
                          {product.price != null && <span className="text-sm font-semibold text-moss">{product.price}</span>}
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
