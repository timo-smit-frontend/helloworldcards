import BannerFigcaption from '~/components/flex/banner/BannerFigcaption'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'
import { CONTACT_EMAIL } from '~/services/contact'

export default function Home() {
  return (
    <>
      <BannerFigcaption
        title="Hello World Cards"
        description="Welcome. We list Pokémon cards here and on Marktplaats, the same stock in both places. Sam also paints custom binders. We show those here and sell them in person at events."
        image="/images/hero.jpg"
        link={{ url: '/products', title: 'See our products' }}
        figcaption="This is our little corner of the world"
      />
      <ContentText
        title="<Hello world />"
        description="We're Sam and Timo, a couple of programmers who never quite grew out of Pokémon. Sam works on the backend, Timo on the frontend, which is why the shop is called Hello World."
        image="/images/wooper.png"
        alt="Pokémon card back"
        link={{ url: '/about', title: 'Learn more about us' }}
      />
      <ContentProducts
        title="Our newest products"
        description="A few cards from the shop. What you see here is the same stock we list on Marktplaats."
        id={[1, 2, 3, 4]}
      />
      <ContentText
        id="content-text-stall"
        title="Cards in the shop, binders at the stall"
        description="We list Pokémon cards here and on Marktplaats. Sam paints custom binders that we show on the site as well. You can look at them here, but we only sell them in person at events."
        image="/images/wooper.png"
        alt=""
        link={{ url: '/agenda', title: 'See upcoming events' }}
      />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, a binder at a stall, or anything else? Send us an email. We read everything."
        image="/images/hero.jpg"
        link={{
          url: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Question from Hello World Cards')}`,
          title: 'Get in touch'
        }}
      />
    </>
  )
}
