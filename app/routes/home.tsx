import BannerFigcaption from '~/components/flex/banner/BannerFigcaption'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'
import { CONTACT_EMAIL } from '~/services/contact'

export default function Home() {
  return (
    <>
      <BannerFigcaption
        title="Hello World Cards: Pokémon cards and more"
        description="Welcome to our little shop. This is where we share what's in stock Pokémon cards, Pokémon art, and more."
        image="https://substackcdn.com/image/fetch/$s_!Np1Z!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F1b5566fa-e0ab-4039-a54b-c1f78dbb59e3_1280x960.jpeg"
        link={{ url: '/products', title: 'Visit the shop' }}
        figcaption="This is our little corner of the world"
      />
      <ContentText
        title="Hey, we're Hello World Cards"
        description="We're Sam & Timo, two Pokémon-loving nerds who turned a hobby into this little corner of the internet. This is where we share what's in stock Pokémon cards, Pokémon art, and whatever else we pick up along the way. Whenever we head to a Pokémon event, we'll post about it here so you can follow along, see what we find, and maybe grab something for your own collection. If you love the games, the cards, or just the world around them as much as we do, you're in the right place."
        link={{ url: '/about', title: 'Learn more about us' }}
      />
      <ContentProducts title="A few favorites" description="Cards and art we love having around." id={[1, 2, 3, 4]} />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, or something in the shop? Send us an email. We'd love to hear from you."
        image="https://substackcdn.com/image/fetch/$s_!Np1Z!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F1b5566fa-e0ab-4039-a54b-c1f78dbb59e3_1280x960.jpeg"
        link={{
          url: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Question from Hello World Cards')}`,
          title: 'Get in touch'
        }}
      />
    </>
  )
}
