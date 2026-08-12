import { Link, useParams } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import { getProductBySlug } from '~/database/products'

export default function Product() {
  const { slug } = useParams()
  const product = slug ? getProductBySlug(slug) : undefined

  if (!product) {
    return (
      <section className="section">
        <div className="container-full flex flex-col gap-4 max-w-3xl">
          <h1 className="title-l">Product not found</h1>
          <p className="content-l text-site-deep-green">We could not find a product at this address.</p>
          <Link to="/products" className="button-deep-green w-fit">
            Back to products
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="container-full">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <Animated delay={100}>
            <div className="relative aspect-3/4 overflow-hidden bg-neutral-100 group">
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
          </Animated>

          <div className="flex flex-col gap-4">
            <Animated delay={200}>
              <h1 className="title-l">{product.title}</h1>
            </Animated>
            {product.category && (
              <Animated delay={300}>
                <p className="content-s text-site-deep-green">{product.category}</p>
              </Animated>
            )}
            {product.price != null && (
              <Animated delay={400}>
                <p className="title-s">{product.price}</p>
              </Animated>
            )}
            <Animated delay={500}>
              <p className="content-l text-site-deep-green">{product.description}</p>
            </Animated>
            <Animated delay={600}>
              <Link to="/products" className="button-deep-green w-fit">
                Back to products
              </Link>
            </Animated>
          </div>
        </div>
      </div>
    </section>
  )
}
