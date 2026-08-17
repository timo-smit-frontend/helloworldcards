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
        description="Pokémon cards listed here and on Marktplaats, plus handpainted binders we bring to events."
        image="/images/hero.jpg"
        link={{ url: '/products', title: 'See our products' }}
        figcaption="This is our little corner of the world"
      />
      <ContentText
        title="<Hello world />"
        description="We're Sam and Timo, a couple of programmers who never quite grew out of Pokémon. That's why the shop is called Hello World."
        image="/images/wooper.png"
        alt="Pokémon card back"
        link={{ url: '/about', title: 'Learn more about us' }}
      />
      <ContentText
        id="content-text-stall"
        title="Cards in the shop, binders at the stall"
        description="We list Pokémon cards here and on Marktplaats. Sam paints custom binders for the event table — you'll see those when we have a stall, not in the checkout."
        image="/images/hero.jpg"
        alt=""
        link={{ url: '/agenda', title: 'See upcoming events' }}
      />
      <ContentProducts
        title="Our newest products"
        description="A few cards from the shop. The same stock lives on Marktplaats."
        id={[1, 2, 3, 4]}
      />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, or anything else? Send us an email."
        image="/images/hero.jpg"
        link={{
          url: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Question from Hello World Cards')}`,
          title: 'Get in touch'
        }}
      />
    </>
  )
}
