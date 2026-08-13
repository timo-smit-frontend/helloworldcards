import BannerImageFull from '~/components/flex/banner/BannerImageFull'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'

export default function Home() {
  return (
    <>
      <BannerImageFull
        title="Welcome to Hello World Cards"
        image="https://picsum.photos/seed/banner/1600/900"
        link={{ url: '/products', title: 'Shop all cards' }}
      />
      <ContentText
        title="Hey, we're Hello World Cards"
        description="We're Samantha and Timo, two Pokémon-loving nerds who turned a hobby into this little corner of the internet. This is where we share what's in stock — Pokémon cards, Pokémon art, and whatever else we pick up along the way. Whenever we head to a Pokémon event, we'll post about it here so you can follow along, see what we find, and maybe grab something for your own collection. If you love the games, the cards, or just the world around them as much as we do, you're in the right place."
      />
      <ContentProducts title="Our bestselling products" description="A few picks from the shop." id={[1, 2, 3, 4]} />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, or something in the shop? Send us an email — we'd love to hear from you."
        image="https://picsum.photos/seed/cta/800/700"
        link={{
          url: `mailto:helloworldcards@outlook.com?subject=${encodeURIComponent('Question from Hello World Cards')}`,
          title: 'Email us'
        }}
      />
    </>
  )
}
