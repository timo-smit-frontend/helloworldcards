import { useMemo } from 'react'
import { useParams } from 'react-router'
import { useCms, useCmsLoading } from '~/cms/context'
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
      <Layout className="justify-center">
        <ContentText heading="h1" title="Loading…" description="Fetching this card." />
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
        // A reserved card has no price to show; the CTA says it is reserved instead.
        price={!product.reserved && product.price != null ? String(product.price) : undefined}
        link={buyLink}
        images={product.images}
        pokemonId={product.pokemonId}
      />
      <ContentText
        id="content-text-marktplaats"
        title="Also on Marktplaats and Vinted"
        description="Every card in the shop is listed on Marktplaats and on Vinted as well, so you can buy wherever you prefer."
        image="/media/wooper.png"
        link={{ url: marktplaats, title: 'See the shop on Marktplaats', target: '_blank' }}
      />
      <ContentProducts title="More from the shop" id={similarIds} products={shop} />
    </Layout>
  )
}
