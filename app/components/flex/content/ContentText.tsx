import { ReactNode } from 'react'
import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import Image from '~/components/elements/Image'
import useLocationFinder from '~/hooks/useLocationFinder'
import { resolveImageAlt } from '~/services/imageCopy'
import { cn } from '~/services/utils'

export type ContentTextSection = {
  title: string
  body: ReactNode
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
  id = 'content-text'
}: {
  title?: string
  srTitle?: string
  description?: string
  image?: string
  alt?: string
  link?: { url: string; title: string; target?: string }
  heading?: 'h1' | 'h2'
  sections?: ContentTextSection[]
  updated?: string
  id?: string
}) {
  const { ref, isFirst } = useLocationFinder()
  const Title = heading
  const hasSections = Boolean(sections?.length)

  return (
    <section id={id} ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div className={cn('grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16', hasSections ? 'items-start' : 'items-stretch')}>
          <div className="flex flex-col gap-8">
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
                  {sections?.map((section) => {
                    const headingId = `content-text-${section.title.toLowerCase().replace(/\s+/g, '-')}`

                    return (
                      <Animated key={section.title} delay={300}>
                        <section className="flex flex-col gap-3" aria-labelledby={headingId}>
                          <h2 id={headingId} className="title-xs">
                            {section.title}
                          </h2>
                          <div className="content-m text-site-mantle [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors hover:[&_a]:text-site-envy">
                            {section.body}
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
