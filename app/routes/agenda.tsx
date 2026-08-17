import ContentAgenda from '~/components/flex/content/ContentAgenda'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentText from '~/components/flex/content/ContentText'
import { SITE_IMAGE } from '~/seo/site'

export default function Agenda() {
  return (
    <>
      <ContentAgenda
        title="Upcoming Pokémon events"
        description="We'll be at these Pokémon events in the Netherlands and Belgium. Come say hi, browse the stall, and have a look at Sam's handpainted binders."
      />
      <ContentText
        title="What you'll find at the stall"
        description="We bring cards from the shop and Sam's custom handpainted binders. You can look at the binders on this site, but we only sell them in person. Cards are listed here and on Marktplaats if you want to browse before you come. If you have a question before an event, email is always fine."
        image="/images/wooper.png"
        alt=""
        link={{ url: '/products', title: 'See our products' }}
      />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, a binder at a stall, or anything else? Send us a message."
        image={SITE_IMAGE}
        link={{ url: '/contact', title: 'Get in touch' }}
      />
    </>
  )
}
