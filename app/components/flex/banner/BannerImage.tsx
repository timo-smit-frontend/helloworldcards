import Autoplay from 'embla-carousel-autoplay'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Animated } from '~/components/elements/Animated'
import Breadcrumbs, { type BreadcrumbItem } from '~/components/elements/Breadcrumbs'
import { Carousel, CarouselContent, CarouselDots, CarouselItem } from '~/components/elements/Carousel'
import EnhanceImage from '~/components/elements/EnhanceImage'
import Image from '~/components/elements/Image'

export default function BannerImage({
  title,
  description,
  images,
  link,
  breadcrumbs
}: {
  title?: string
  description?: string
  images?: string[]
  link?: { url?: string; target?: string; title?: string }
  breadcrumbs?: BreadcrumbItem[]
}) {
  const slides = images?.filter(Boolean) ?? []

  return (
    <section id="banner-image" className="my-16">
      <div className="container-full">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
          {(title || description || link || breadcrumbs?.length) && (
            <Animated delay={100}>
              <div className="flex h-full flex-col lg:gap-0 gap-8 lg:py-20">
                {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
                <BannerSlider images={slides} alt={title ?? 'Banner'} className="w-full shrink-0 lg:hidden" />
                <div className="flex flex-1 flex-col justify-center gap-4 lg:gap-8">
                  {(title || description) && (
                    <div className="flex flex-col gap-2 lg:gap-4">
                      {title && <h1 className="title-xl">{title}</h1>}
                      {description && (
                        <Animated delay={200}>
                          <p className="content-xl text-site-mantle">{description}</p>
                        </Animated>
                      )}
                    </div>
                  )}
                  {link?.url && link?.title && (
                    <Animated delay={300}>
                      <div>
                        <a href={link.url} target={link.target} className="button-green mt-auto">
                          {link.title}
                        </a>
                      </div>
                    </Animated>
                  )}
                </div>
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

const reduceMotionQuery = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia(reduceMotionQuery)
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia(reduceMotionQuery).matches
}

function BannerSlider({ images, alt, className }: { images: string[]; alt: string; className?: string }) {
  const prefersReducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => true)
  const [controller, setController] = useState({ toggler: false, slide: 1 })
  const autoplay = useMemo(
    () =>
      Autoplay({
        delay: 5000,
        stopOnInteraction: true,
        stopOnMouseEnter: true,
        stopOnFocusIn: true
      }),
    []
  )

  if (images.length === 0) return null

  const canAutoplay = images.length > 1 && !prefersReducedMotion

  return (
    <div className={className}>
      <Carousel
        opts={{ loop: images.length > 1 }}
        key={canAutoplay ? 'autoplay' : 'static'}
        plugins={canAutoplay ? [autoplay] : undefined}
        aria-label={alt}
        className="flex flex-col overflow-hidden rounded-panel bg-site-gunmetal"
      >
        <CarouselContent>
          {images.map((src, index) => (
            <CarouselItem key={`${src}-${index}`} className="basis-full">
              <button
                type="button"
                className="block w-full cursor-pointer"
                aria-label={`Enlarge ${alt}`}
                onClick={() => setController({ toggler: true, slide: index + 1 })}
              >
                <Image
                  src={src}
                  alt=""
                  width={600}
                  height={800}
                  aria-hidden
                  className="aspect-3/4 h-auto max-h-120 w-full object-contain p-10 lg:max-h-160"
                  maxwidth={1200}
                />
              </button>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselDots className="pb-6" />
      </Carousel>
      <EnhanceImage controller={controller} setController={setController} sources={images} alt={alt} />
    </div>
  )
}
