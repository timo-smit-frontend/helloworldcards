import ContentContact from '~/components/flex/content/ContentContact'
import ContentFaq from '~/components/flex/content/ContentFaq'
import { getFaqsByPage } from '~/database/faq'

export default function Contact() {
  return (
    <>
      <ContentContact
        title="Get in touch with us"
        description="Questions about a card, an event, a binder at a stall, or anything else? Send us a message. Email is always fine, even if a card is also on Marktplaats."
      />
      <ContentFaq items={getFaqsByPage('contact')} />
    </>
  )
}
