import BannerFigcaption from '~/components/flex/banner/BannerFigcaption'
import ContentAbout from '~/components/flex/content/ContentAbout'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentFaq from '~/components/flex/content/ContentFaq'
import ContentText from '~/components/flex/content/ContentText'
import { getFaqsByPage } from '~/database/faq'
import { SITE_IMAGE } from '~/seo/site'

export default function About() {
  return (
    <>
      <BannerFigcaption
        title="Hello, we're Sam and Timo"
        description="We're a couple who turned a Pokémon hobby into this little shop. You'll find cards online, the events we're heading to, and a stall when we're out."
        image={SITE_IMAGE}
        figcaption="This is us in our natural habitat."
        alt="Pokémon cards and art from the Hello World Cards shop."
      />
      <ContentAbout
        title="A hobby that turned into a little shop"
        description="Hello World Cards is us: Sam and Timo. We never quite grew out of Pokémon, and we both write software, which is why the shop is called Hello World. We list cards here and on Marktplaats, and we write up the events we're heading to."
        people={[
          {
            name: 'Sam',
            pokemonIds: [194, 195, 143, 151, 54, 79],
            description:
              'Backend developer, and a die-hard Wooper and Quagsire collector. The muddy, dopey Water-types are a forever chase. Psyduck and Slowpoke live in the same pile, Snorlax too: same sleepy energy as Sam. Mew shows up whenever the art is too pretty to skip, and cute or pretty full arts almost never get walked past at a table. Sam also paints the binders we bring to events.'
          },
          {
            name: 'Timo',
            pokemonIds: [94, 280, 186, 330, 285, 150],
            description:
              'Frontend developer who has been after Gengar and Ralts for years. Ghosts, psychics, and a few odd frogs are a forever chase. Mewtwo still stops a scroll, Shroomish is an easy yes, and Flygon and Politoed are the ones that make an event stall last a little longer than it should. A Gengar or Ralts full art almost never gets walked past at a table. Timo also builds this shop, from the listings to the site itself.'
          }
        ]}
        peopleCaption="Two nerds who never quite outgrew Pokémon."
      />
      <ContentText
        title="What we bring to a stall"
        description="We bring cards from the shop, and Sam's custom handpainted binders. The binders are on the site so you can see them. We only sell them in person at the next event."
        image="/images/wooper.png"
        alt=""
        link={{ url: '/agenda/', title: 'See upcoming events' }}
      />
      <ContentFaq items={getFaqsByPage('about')} />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, a binder at a stall, or anything else? Send us a message."
        image={SITE_IMAGE}
        link={{ url: '/contact/', title: 'Get in touch' }}
      />
    </>
  )
}
