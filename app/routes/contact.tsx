import ContentContact from '~/components/flex/content/ContentContact'
import ContentFaq from '~/components/flex/content/ContentFaq'
import { getFaqsByPage } from '~/database/faq'

export default function Contact() {
  return (
    <>
      <ContentContact
        title="Get in touch"
        description="Questions about a card, an event, a binder at a stall, or anything else? Send us a message."
      />
      <ContentFaq items={getFaqsByPage('contact')} />
    </>
  )
}
