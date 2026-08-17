import ContentContact from '~/components/flex/content/ContentContact'
import ContentFaq from '~/components/flex/content/ContentFaq'
import { getFaqsByPage } from '~/database/faq'

export default function Contact() {
  return (
    <>
      <ContentContact
        title="Get in touch"
        description="Questions about a card, an event, or something in the shop? Send us a message. We'd love to hear from you."
      />
      <ContentFaq items={getFaqsByPage('contact')} />
    </>
  )
}
