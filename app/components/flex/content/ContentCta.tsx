import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import Image from '~/components/elements/Image'
import useLocationFinder from '~/hooks/useLocationFinder'
import { cn } from '~/services/utils'

export default function ContentCta({
  title,
  description,
  image,
  link,
  id = 'content-cta'
}: {
  title?: string
  description?: string
  image?: string
  link?: { url?: string; title?: string }
  id?: string
}) {
  const { ref, isFirst } = useLocationFinder()

  return (
    <section id={id} ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        {isFirst && (
          <div className="mb-8">
            <Breadcrumbs />
          </div>
        )}
        <div className="grid items-center overflow-hidden rounded-panel bg-site-gunmetal shadow-card ring-1 ring-site-mulled-wine sm:grid-cols-2 lg:gap-16 gap-10">
          {(title || description || link) && (
            <div className={cn('flex flex-col gap-4 px-6 py-10 sm:px-8 lg:gap-8 lg:px-12 lg:py-16', !image && 'items-center text-center')}>
              {(title || description) && (
                <div className="flex flex-col gap-2 lg:gap-4">
                  {title && (
                    <Animated delay={100}>
                      <h2 className="title-l">{title}</h2>
                    </Animated>
                  )}
                  {description && (
                    <Animated delay={200}>
                      <p className="content-l text-site-mantle">{description}</p>
                    </Animated>
                  )}
                </div>
              )}
              {link?.url && link?.title && (
                <Animated delay={300}>
                  <div>
                    <a href={link.url} className="button-green gap-2.5">
                      {link.title}
                    </a>
                  </div>
                </Animated>
              )}
            </div>
          )}
          {image && (
            <Animated delay={400}>
              <Image
                src={image}
                alt=""
                width={1280}
                height={960}
                maxwidth={1200}
                className="sm:aspect-7/6 aspect-3/2 h-full w-full object-cover max-h-140"
              />
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
