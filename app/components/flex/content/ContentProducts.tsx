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
            <div className="flex flex-col gap-4 max-w-3xl">
              {title && (
                <Animated delay={100}>
                  <h2 className="title-l">{title}</h2>
                </Animated>
              )}
              {description && (
                <Animated delay={200}>
                  <p className="content-l text-site-deep-green">{description}</p>
                </Animated>
              )}
            </div>
          )}

          {products.length > 0 && (
            <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
              {products.map((product, index) => (
                <li key={product.id}>
                  <Animated delay={productDelays[index % productDelays.length]}>
                    <Link to={`/products/${product.slug}`} className="group flex flex-col gap-3">
                      <div className="relative aspect-3/4 overflow-hidden bg-neutral-100">
                        <img
                          src={product.image}
                          alt={product.title}
                          className="absolute inset-0 size-full object-cover transition-opacity duration-300 group-hover:opacity-0"
                        />
                        <img
                          src={product.imageHover}
                          alt=""
                          aria-hidden
                          className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        />
                      </div>
                      <span className="title-xs">{product.title}</span>
                      {product.price != null && <span className="content-s text-site-deep-green">{product.price}</span>}
                    </Link>
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
