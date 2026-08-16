import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import Image from '~/components/elements/Image'
import useLocationFinder from '~/hooks/useLocationFinder'

export default function BannerFigcaption({
  title,
  description,
  image,
  link,
  figcaption,
  alt = ''
}: {
  title?: string
  description?: string
  image?: string
  link?: { url?: string; target?: string; title?: string }
  figcaption?: string
  alt?: string
}) {
  const { ref, isFirst } = useLocationFinder()

  return (
    <section id="banner-figcaption" ref={ref} className="bg-site-dark lg:mt-16 mt-12">
      <div className="container-full">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="flex flex-col gap-8 lg:h-full lg:gap-0">
            {isFirst && <Breadcrumbs />}
            <div className="flex flex-col justify-center gap-4 lg:flex-1 lg:gap-8">
              {(title || description) && (
                <div className="flex flex-col gap-2 lg:gap-4">
                  {title && (
                    <Animated delay={200}>
                      <h1 className="title-xl text-balance">{title}</h1>
                    </Animated>
                  )}
                  {description && (
                    <Animated delay={300}>
                      <p className="content-l max-w-xl text-site-mantle">{description}</p>
                    </Animated>
                  )}
                </div>
              )}
              {link?.url && link?.title && (
                <Animated delay={400}>
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
            <Animated delay={500}>
              <figure className="mat">
                <Image
                  src={image}
                  alt={alt}
                  width={1280}
                  height={960}
                  priority
                  className="aspect-3/2 w-full rounded-[0.9rem] object-cover"
                />
                {figcaption && <figcaption className="mt-3 px-1 text-sm text-site-mantle">{figcaption}</figcaption>}
              </figure>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
