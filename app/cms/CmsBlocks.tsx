import BannerFigcaption from '~/components/flex/banner/BannerFigcaption'
import ContentAbout from '~/components/flex/content/ContentAbout'
import ContentAgenda from '~/components/flex/content/ContentAgenda'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentFaq from '~/components/flex/content/ContentFaq'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'
import FormContact from '~/components/flex/form/FormContact'
import { FEATURED_PRODUCT_COUNT, type CmsBlock } from './types'
import { useCms } from './context'

export function CmsBlocks({ blocks }: { blocks: CmsBlock[] }) {
  const cms = useCms()
  const products = cms?.products ?? []
  const events = cms?.events ?? []
  const faqs = cms?.faqs ?? []

  return (
    <>
      {blocks.map((block) => {
        switch (block.type) {
          case 'banner_figcaption':
            return (
              <BannerFigcaption
                key={block.id}
                title={block.title}
                srTitle={block.srTitle}
                description={block.description}
                image={block.image}
                alt={block.alt}
                figcaption={block.figcaption}
                link={block.link}
              />
            )
          case 'content_text':
            return (
              <ContentText
                key={block.id}
                title={block.title}
                srTitle={block.srTitle}
                description={block.description}
                image={block.image}
                alt={block.alt}
                heading={block.heading}
                link={block.link}
                updated={block.updated}
                sections={block.sections}
              />
            )
          case 'content_cta':
            return (
              <ContentCta
                key={block.id}
                title={block.title}
                description={block.description}
                image={block.image}
                alt={block.alt}
                link={block.link}
              />
            )
          case 'content_products':
            return (
              <ContentProducts
                key={block.id}
                title={block.title}
                description={block.description}
                random={block.random ? FEATURED_PRODUCT_COUNT : undefined}
                products={products}
              />
            )
          case 'content_agenda':
            return <ContentAgenda key={block.id} title={block.title} description={block.description} id={block.eventIds} events={events} />
          case 'content_faq':
            return (
              <ContentFaq
                key={block.id}
                title={block.title}
                items={faqs.filter((item) => !block.faqIds?.length || block.faqIds.includes(item.id))}
              />
            )
          case 'content_about':
            return (
              <ContentAbout
                key={block.id}
                title={block.title}
                description={block.description}
                people={block.people}
                peopleCaption={block.peopleCaption}
              />
            )
          case 'form_contact':
            return <FormContact key={block.id} title={block.title} description={block.description} />
          default:
            return null
        }
      })}
    </>
  )
}
