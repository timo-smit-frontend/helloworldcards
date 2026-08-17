import BannerFigcaption from '~/components/flex/banner/BannerFigcaption'
import ContentAbout from '~/components/flex/content/ContentAbout'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentFaq from '~/components/flex/content/ContentFaq'
import { getFaqsByPage } from '~/database/faq'
import { SITE_IMAGE } from '~/seo/site'

export default function About() {
  return (
    <>
      <BannerFigcaption
        title="We're Sam and Timo"
        description="We're a couple who turned a Pokémon hobby into this little shop. Cards, art, and the events we show up at. That's what you'll find here."
        image={SITE_IMAGE}
        figcaption="From our little corner of the hobby."
        alt="Pokémon cards and art from the Hello World Cards shop."
      />
      <ContentAbout
        title="A hobby that turned into a little shop"
        description="Hello World Cards is us: Sam and Timo, a couple who never quite grew out of Pokémon. What started as a hobby, pulling packs, chasing art, lingering too long at events, turned into this small shop. We list what we have in stock, write up the events we're heading to, and keep the door open if you want to talk cards."
        people={[
          {
            name: 'Sam',
            description:
              'Backend developer, and a die-hard Wooper and Quagsire collector. The muddy, dopey Water-types are a forever chase. Psyduck and Slowpoke live in the same pile, Mew shows up whenever the art is too pretty to skip, and cute or pretty full arts almost never get walked past at a table.'
          },
          {
            name: 'Timo',
            description:
              'Frontend developer who has been after Gengar and Ralts for years. Ghosts, psychics, and a few odd frogs: Mewtwo still stops a scroll, Shroomish is an easy yes, and Flygon and Politoed are the ones that make an event stall last a little longer than it should.'
          }
        ]}
        peopleCaption="Two nerds who never quite outgrew Pokémon."
      />
      <ContentFaq items={getFaqsByPage('about')} />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, or something in the shop? Send us a message. We'd love to hear from you."
        image={SITE_IMAGE}
        link={{ url: '/contact', title: 'Get in touch' }}
      />
    </>
  )
}
