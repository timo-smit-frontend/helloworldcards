import ContentCta from '~/components/flex/content/ContentCta'
import ContentProducts from '~/components/flex/content/ContentProducts'
import { SITE_IMAGE } from '~/seo/site'

export default function Products() {
  return (
    <>
      <ContentProducts
        title="All the products we currently have in stock"
        description="Pokémon cards we have right now, listed here and on Marktplaats."
      />
      <ContentCta
        title="Looking for a binder?"
        description="Sam's handpainted binders aren't in the shop. We bring them to events."
        image={SITE_IMAGE}
        link={{ url: '/agenda', title: 'See upcoming events' }}
      />
    </>
  )
}
