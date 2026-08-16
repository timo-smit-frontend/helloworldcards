import Autoplay from 'embla-carousel-autoplay'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import { Carousel, CarouselContent, CarouselDots, CarouselItem } from '~/components/elements/Carousel'
import EnhanceImage from '~/components/elements/EnhanceImage'
import Image from '~/components/elements/Image'
import useLocationFinder from '~/hooks/useLocationFinder'

export default function BannerImage({
  title,
  subtitle,
  price,
  description,
  images,
  link
}: {
  title?: string
  subtitle?: string
  price?: string
  description?: string
  images?: string[]
  link?: { url?: string; target?: string; title?: string }
}) {
  const { ref, isFirst } = useLocationFinder()
  const slides = images?.filter(Boolean) ?? []

  return (
    <section id="banner-image" ref={ref} className="lg:my-16 mt-12">
      <div className="container-full">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
          {(title || subtitle || description || price || link) && (
            <Animated delay={100}>
              <div className="flex flex-col gap-8 lg:h-full lg:gap-0 lg:py-20">
                {isFirst && <Breadcrumbs />}
                <BannerSlider images={slides} alt={title ?? 'Banner'} className="w-full shrink-0 lg:hidden" />
                <div className="flex flex-col justify-center gap-4 lg:flex-1 lg:gap-8">
                  {(title || subtitle || description || price) && (
                    <div className="flex flex-col gap-2 lg:gap-4">
                      {(subtitle || title) && (
                        <div className="flex flex-col gap-1">
                          {subtitle && <p className="content-l font-semibold text-site-mantle">{subtitle}</p>}
                          {title && <h1 className="title-xl">{title}</h1>}
                        </div>
                      )}
                      {description && (
                        <Animated delay={200}>
                          <p className="content-m text-site-mantle">{description}</p>
                        </Animated>
                      )}
                      {price && (
                        <Animated delay={300}>
                          <p className="content-xl font-semibold">{price}</p>
                        </Animated>
                      )}
                    </div>
                  )}
                  {link?.url && link?.title && (
                    <Animated delay={400}>
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
                className="flex w-full cursor-pointer items-center justify-center p-5 lg:p-8"
                aria-label={`Enlarge ${alt}`}
                onClick={() => setController({ toggler: true, slide: index + 1 })}
              >
                <Image
                  src={src}
                  alt=""
                  width={400}
                  height={560}
                  aria-hidden
                  priority
                  sizes="(min-width: 1024px) 20rem, 16rem"
                  className="h-100 w-auto max-w-full min-w-min object-contain lg:h-120"
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
