import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import Image from '~/components/elements/Image'
import useLocationFinder from '~/hooks/useLocationFinder'
import { cn } from '~/services/utils'

export default function ContentText({
  title,
  description,
  image,
  alt = '',
  link,
  heading = 'h2'
}: {
  title?: string
  description?: string
  image?: string
  alt?: string
  link?: { url: string; title: string }
  heading?: 'h1' | 'h2'
}) {
  const { ref, isFirst } = useLocationFinder()
  const Title = heading

  return (
    <section id="content-text" ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-8">
            {isFirst && <Breadcrumbs />}
            <div className="flex flex-col gap-4 lg:gap-8">
              {(title || description) && (
                <div className="flex flex-col gap-2 lg:gap-4">
                  {title && (
                    <Animated delay={100}>
                      <Title className="title-l">{title}</Title>
                    </Animated>
                  )}
                  {description && (
                    <Animated delay={200}>
                      <p className="content-l text-site-mantle">{description}</p>
                    </Animated>
                  )}
                </div>
              )}
              {link && (
                <Animated delay={300}>
                  <div>
                    <a href={link.url} className="button-green">
                      {link.title}
                    </a>
                  </div>
                </Animated>
              )}
            </div>
          </div>
          {image && (
            <Animated delay={400}>
              <div className="relative overflow-hidden lg:h-full">
                <Image
                  src={image}
                  alt={alt}
                  width={1280}
                  height={960}
                  className="h-auto w-full lg:absolute lg:inset-0 lg:h-full lg:w-full object-contain max-h-100"
                />
              </div>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
