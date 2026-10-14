import { ReactNode } from 'react'
import { Markdown } from '~/cms/markdown'
import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import Image from '~/components/elements/Image'
import useLocationFinder from '~/hooks/useLocationFinder'
import { resolveImageAlt } from '~/services/imageCopy'
import { CONTENT_IMAGE_SIZES } from '~/services/responsiveImage'
import { cn } from '~/services/utils'

type ContentTextSection = {
  title: string
  body: ReactNode | string
}

export default function ContentText({
  title,
  srTitle,
  description,
  image,
  alt,
  link,
  heading = 'h2',
  sections,
  updated,
  centered = false,
  id = 'content-text'
}: {
  title?: string
  srTitle?: string
  description?: string
  image?: string
  alt?: string
  link?: { url?: string; title?: string; target?: string }
  heading?: 'h1' | 'h2'
  sections?: ContentTextSection[]
  updated?: string
  /** Without an image beside it, the text sits in the middle of the page instead of in the left half. */
  centered?: boolean
  id?: string
}) {
  const { ref, isFirst } = useLocationFinder()
  const Title = heading
  // Subsections sit one level below the section's own heading.
  const SectionTitle = heading === 'h1' ? 'h2' : 'h3'
  const hasSections = Boolean(sections?.length)
  const centerText = centered && !image

  return (
    <section id={id} ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div
          className={cn(
            'grid grid-cols-1 gap-10 lg:gap-16',
            !centerText && 'lg:grid-cols-2',
            hasSections ? 'items-start' : 'items-stretch'
          )}
        >
          <div className={cn('flex flex-col gap-8', centerText && 'mx-auto w-full max-w-4xl')}>
            {isFirst && <Breadcrumbs />}
            <div className="flex flex-col gap-4 lg:gap-8">
              {(title || description) && (
                <div className="flex flex-col gap-2 lg:gap-4">
                  {srTitle && <Title className="sr-only">{srTitle}</Title>}
                  {title && (
                    <Animated delay={100}>
                      {srTitle ? (
                        <p className="title-l" aria-hidden>
                          {title}
                        </p>
                      ) : (
                        <Title className="title-l">{title}</Title>
                      )}
                    </Animated>
                  )}
                  {description && (
                    <Animated delay={200}>
                      <p className="content-l text-site-mantle">{description}</p>
                    </Animated>
                  )}
                </div>
              )}
              {hasSections && (
                <div className="flex flex-col gap-10 lg:gap-12">
                  {sections?.map((section, index) => {
                    // A section without a title is the lead-in before the first heading.
                    const headingId = section.title ? `${id}-${section.title.toLowerCase().replace(/\s+/g, '-')}` : undefined

                    return (
                      <Animated key={section.title || index} delay={300}>
                        <section className="flex flex-col gap-3" aria-labelledby={headingId}>
                          {section.title && (
                            <SectionTitle id={headingId} className="title-xs">
                              {section.title}
                            </SectionTitle>
                          )}
                          <div className="content-m text-site-mantle [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors hover:[&_a]:text-site-envy">
                            {typeof section.body === 'string' ? <Markdown text={section.body} /> : section.body}
                          </div>
                        </section>
                      </Animated>
                    )
                  })}
                </div>
              )}
              {updated && <p className="content-s text-site-mantle">Last updated {updated}.</p>}
              {link && (
                <Animated delay={300}>
                  <div>
                    <a
                      href={link.url}
                      target={link.target}
                      rel={link.target === '_blank' ? 'noreferrer noopener' : undefined}
                      className="button-green"
                    >
                      {link.title}
                      {link.target === '_blank' ? <span className="sr-only"> (opens in a new tab)</span> : null}
                    </a>
                  </div>
                </Animated>
              )}
            </div>
          </div>
          {image && (
            <Animated delay={400}>
              <div className={cn('relative overflow-hidden', !hasSections && 'lg:h-full')}>
                <Image
                  src={image}
                  alt={resolveImageAlt(image, alt)}
                  width={1280}
                  height={960}
                  sizes={CONTENT_IMAGE_SIZES}
                  maxwidth={800}
                  className={cn(
                    'h-auto w-full object-contain max-h-100',
                    !hasSections && 'lg:absolute lg:inset-0 lg:left-0 lg:right-0 lg:mx-auto lg:h-full lg:w-auto'
                  )}
                />
              </div>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
