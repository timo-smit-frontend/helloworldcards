import { useMemo } from 'react'
import { useParams } from 'react-router'
import BannerImage from '~/components/flex/banner/BannerImage'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'
import Layout from '~/components/layout/Layout'
import { getProductBySlug, getSimilarProducts } from '~/database/products'
import { CONTACT_EMAIL } from '~/services/contact'

export default function Product() {
  const { slug } = useParams()
  const product = slug ? getProductBySlug(slug) : undefined
  const similarIds = useMemo(() => (product ? getSimilarProducts(product.id, 4).map((item) => item.id) : []), [product])

  if (!product) {
    return (
      <Layout className="justify-center">
        <ContentText
          heading="h1"
          title="Product not found"
          description="This product does not exist or has been moved."
          link={{ url: '/products', title: 'Back to all products' }}
        />
      </Layout>
    )
  }

  return (
    <Layout>
      <BannerImage
        title={product.title}
        description={product.description}
        link={{ url: `mailto:${CONTACT_EMAIL}`, title: `Buy the ${product.title}` }}
        images={product.images}
      />
      <ContentProducts title="Other similar products" id={similarIds} />
    </Layout>
  )
}
