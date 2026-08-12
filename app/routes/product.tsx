import { Link, useParams } from 'react-router'
import BannerImage from '~/components/flex/banner/BannerImage'
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

  return <BannerImage title={product.title} description={product.description} image={product.image} />
}
