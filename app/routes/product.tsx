import { useMemo } from 'react'
import { useParams } from 'react-router'
import { useCms, useCmsLoading } from '~/cms/context'
import { ProductSkeleton } from '~/cms/loading'
import BannerCarousel from '~/components/flex/banner/BannerCarousel'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'
import Layout from '~/components/layout/Layout'
import { productBuyLink } from '~/database/products'
import { MARKTPLAATS_URL } from '~/services/contact'

export default function Product() {
  const { slug } = useParams()
  const cms = useCms()
  const loading = useCmsLoading()
  const product = cms?.product && cms.product.slug === slug ? cms.product : undefined
  const similarIds = cms?.similarProductIds ?? []
  const shop = cms?.products ?? []
  const marktplaats = cms?.settings.marktplaatsUrl ?? MARKTPLAATS_URL

  const buyLink = useMemo(() => (product ? productBuyLink(product) : null), [product])

  if (loading) {
    return (
      <Layout>
        <ProductSkeleton />
      </Layout>
    )
  }

  if (!cms || !product || !buyLink) {
    return (
      <Layout className="justify-center">
        <ContentText
          heading="h1"
          title={cms?.settings.notFoundTitle ?? 'Product not found'}
          description="This product does not exist or has been moved."
          link={{ url: '/products/', title: 'Back to all products' }}
        />
      </Layout>
    )
  }

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
        image="/media/wooper.png"
        link={{ url: marktplaats, title: 'Visit us on Marktplaats', target: '_blank' }}
      />
      <ContentProducts title="More from the shop" id={similarIds} products={shop} />
    </Layout>
  )
}
