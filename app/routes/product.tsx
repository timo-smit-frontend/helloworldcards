import { useMemo } from 'react'
import { useParams } from 'react-router'
import BannerCarousel from '~/components/flex/banner/BannerCarousel'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'
import Layout from '~/components/layout/Layout'
import { getProductBySlug, getSimilarProducts } from '~/database/products'
import { CONTACT_EMAIL, MARKTPLAATS_URL } from '~/services/contact'

export default function Product() {
  const { slug } = useParams()
  const product = slug ? getProductBySlug(slug) : undefined
  const similarIds = useMemo(() => (product ? getSimilarProducts(product.id, 4).map((item) => item.id) : []), [product])

  if (!product) {
    return (
      <Layout className="justify-center">
        <ContentText
          heading="h1"
          title="This product was not found"
          description="This product does not exist or has been moved."
          link={{ url: '/products/', title: 'Back to all products' }}
        />
      </Layout>
    )
  }

  const buyLink = product.marktplaatsUrl
    ? { url: product.marktplaatsUrl, title: 'View on Marktplaats', target: '_blank' as const }
    : { url: `mailto:${CONTACT_EMAIL}`, title: 'Email us about this' }

  return (
    <Layout>
      <BannerCarousel
        title={product.title}
        subtitle={product.subtitle}
        description={product.description}
        price={product.price != null ? String(product.price) : undefined}
        link={buyLink}
        images={product.images}
        pokemonId={product.pokemonId}
      />
      <ContentText
        id="content-text-marktplaats"
        title="We sell on Marktplaats"
        description="Hello World Cards sells its products on Marktplaats. View our stock there through the button below."
        image="/images/wooper.png"
        link={{ url: MARKTPLAATS_URL, title: 'Visit us on Marktplaats', target: '_blank' }}
      />
      <ContentProducts title="More from the shop" id={similarIds} />
    </Layout>
  )
}
