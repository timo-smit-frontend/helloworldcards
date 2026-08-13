import Autoplay from 'embla-carousel-autoplay'
import { useMemo } from 'react'
import { Animated } from '~/components/elements/Animated'
import Breadcrumbs, { type BreadcrumbItem } from '~/components/elements/Breadcrumbs'
import { Carousel, CarouselContent, CarouselDots, CarouselItem } from '~/components/elements/Carousel'

export default function BannerImage({
  title,
  description,
  image,
  images,
  link,
  breadcrumbs
}: {
  title?: string
  description?: string
  image?: string
  images?: string[]
  link?: { url?: string; target?: string; title?: string }
  breadcrumbs?: BreadcrumbItem[]
}) {
  const slides = (images?.length ? images : image ? [image] : []).filter(Boolean)

  return (
    <section id="banner-image" className="my-16">
      <div className="container-full">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
          {(title || description || link || breadcrumbs?.length) && (
            <Animated delay={100}>
              <div className="flex h-full flex-col gap-4 py-20">
                {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
                <BannerSlider images={slides} alt={title ?? 'Banner'} className="lg:hidden" />
                <div className="flex flex-1 flex-col justify-center gap-3 lg:gap-6">
                  {title && <h1 className="title-xl">{title}</h1>}
                  {description && (
                    <Animated delay={200}>
                      <p className="content-xl text-muted">{description}</p>
                    </Animated>
                  )}
                </div>
                {link?.url && link?.title && (
                  <Animated delay={300}>
                    <a href={link.url} target={link.target} className="button-leaf mt-auto">
                      {link.title}
                    </a>
                  </Animated>
                )}
              </div>
            </Animated>
          )}
          {slides.length > 0 && (
            <Animated delay={400}>
              <div className="max-lg:hidden">
                <BannerSlider images={slides} alt={title ?? 'Banner'} />
              </div>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}

function BannerSlider({ images, alt, className }: { images: string[]; alt: string; className?: string }) {
  const autoplay = useMemo(
    () =>
      Autoplay({
        delay: 7000,
        stopOnInteraction: false
      }),
    []
  )

  if (images.length === 0) return null

  return (
    <div className={className}>
      <Carousel
        opts={{ loop: images.length > 1 }}
        plugins={images.length > 1 ? [autoplay] : undefined}
        className="flex flex-col overflow-hidden rounded-panel bg-cream"
      >
        <CarouselContent>
          {images.map((src, index) => (
            <CarouselItem key={`${src}-${index}`} className="basis-full">
              <img
                src={src}
                alt={index === 0 ? alt : ''}
                aria-hidden={index === 0 ? undefined : true}
                className="aspect-3/4 h-auto max-h-120 w-full object-contain p-10 lg:max-h-160"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselDots className="pb-6" />
      </Carousel>
    </div>
  )
}
