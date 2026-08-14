import { Link } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import Image from '~/components/elements/Image'
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
  const Heading = ids ? 'h2' : 'h1'

  return (
    <section id="content-products" className="section">
      <div className="container-full">
        <div className="flex flex-col gap-10">
          {(title || description) && (
            <div className="flex flex-col gap-2 lg:gap-4 max-w-4xl">
              {title && (
                <Animated delay={100}>
                  <Heading className="title-l">{title}</Heading>
                </Animated>
              )}
              {description && (
                <Animated delay={200}>
                  <p className="content-s text-site-mantle">{description}</p>
                </Animated>
              )}
            </div>
          )}

          {products.length > 0 && (
            <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product, index) => (
                <li key={product.id} className="flex">
                  <Animated delay={productDelays[index % productDelays.length]}>
                    <div className="flex flex-1 flex-col">
                      <Link
                        to={`/products/${product.slug}`}
                        className="group flex flex-1 flex-col overflow-hidden rounded-panel bg-site-gunmetal shadow-card ring-1 ring-site-mulled-wine smooth hover:-translate-y-0.5 hover:shadow-md hover:ring-site-envy"
                      >
                        <div className="relative aspect-4/5 max-lg:h-100 w-full shrink-0 p-5">
                          {product.images[0] && (
                            <Image
                              src={product.images[0]}
                              alt=""
                              width={400}
                              height={500}
                              aria-hidden
                              className={`size-full object-contain ${product.images[1] ? 'smooth group-hover:opacity-0' : ''}`}
                            />
                          )}
                          {product.images[1] && (
                            <Image
                              src={product.images[1]}
                              alt=""
                              width={400}
                              height={500}
                              aria-hidden
                              className="absolute inset-5 size-[calc(100%-2.5rem)] object-contain opacity-0 smooth group-hover:opacity-100"
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1 border-t border-site-mulled-wine px-4 py-3">
                          <span className="text-sm leading-snug text-site-mantle">{product.description}</span>
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
