import ContentCta from '~/components/flex/content/ContentCta'
import ContentProducts from '~/components/flex/content/ContentProducts'
import { SITE_IMAGE } from '~/seo/site'

export default function Products() {
  return (
    <>
      <ContentProducts
        title="All the products we currently have in stock"
        description="Pokémon cards we have right now. They are listed here and on Marktplaats, so you can browse on the site and buy through the listing when one is up."
      />
      <ContentCta
        title="Looking for a binder?"
        description="Sam's handpainted binders are on the site so you can see them, but they are not for sale here. They are one-off pieces we sell in person at events."
        image={SITE_IMAGE}
        link={{ url: '/agenda', title: 'See upcoming events' }}
      />
    </>
  )
}
