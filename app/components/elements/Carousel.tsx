import * as React from 'react'
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import { cn } from '~/services/utils'

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: CarouselApi
}

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = React.useContext(CarouselContext)

  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />')
  }

  return context
}

function Carousel({
  opts,
  plugins,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  opts?: UseCarouselParameters[0]
  plugins?: UseCarouselParameters[1]
}) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: 'x'
    },
    plugins
  )

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev()
  }, [api])

  const scrollNext = React.useCallback(() => {
    api?.scrollNext()
  }, [api])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        scrollPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        scrollNext()
      }
    },
    [scrollPrev, scrollNext]
  )

  return (
    <CarouselContext.Provider value={{ carouselRef, api }}>
      <div onKeyDownCapture={handleKeyDown} className={cn('relative', className)} role="region" aria-roledescription="carousel" {...props}>
        {children}
      </div>
    </CarouselContext.Provider>
  )
}

function CarouselContent({ className, viewportClassName, ...props }: React.ComponentProps<'div'> & { viewportClassName?: string }) {
  const { carouselRef } = useCarousel()

  return (
    <div ref={carouselRef} className={cn('overflow-hidden', viewportClassName)}>
      <div className={cn('flex', className)} {...props} />
    </div>
  )
}

function CarouselItem({ className, ...props }: React.ComponentProps<'div'>) {
  return <div role="group" aria-roledescription="slide" className={cn('min-w-0 shrink-0 grow-0', className)} {...props} />
}

function CarouselDots({ className }: { className?: string }) {
  const { api } = useCarousel()
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([])
  const [paused, setPaused] = React.useState(false)

  React.useEffect(() => {
    if (!api) return

    const onInit = (emblaApi: CarouselApi) => {
      if (!emblaApi) return
      setScrollSnaps(emblaApi.scrollSnapList())
    }

    const onSelect = (emblaApi: CarouselApi) => {
      if (!emblaApi) return
      setSelectedIndex(emblaApi.selectedScrollSnap())
    }

    onInit(api)
    onSelect(api)
    api.on('reInit', onInit)
    api.on('reInit', onSelect)
    api.on('select', onSelect)

    return () => {
      api.off('reInit', onInit)
      api.off('reInit', onSelect)
      api.off('select', onSelect)
    }
  }, [api])

  if (scrollSnaps.length <= 1) return null

  const autoplay = api?.plugins()?.autoplay

  return (
    <div className={cn('flex items-center justify-center gap-3', className)}>
      <div className="flex justify-center gap-1" role="tablist" aria-label="Slides">
        {scrollSnaps.map((_, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-label={`Go to slide ${index + 1}`}
            aria-selected={index === selectedIndex}
            className="flex size-6 cursor-pointer items-center justify-center rounded-full"
            onClick={() => api?.scrollTo(index)}
          >
            <span
              className={cn('size-2.5 rounded-full', index === selectedIndex ? 'bg-site-envy' : 'border-2 border-site-envy bg-transparent')}
              aria-hidden
            />
          </button>
        ))}
      </div>
      {autoplay && (
        <button
          type="button"
          className="flex size-6 cursor-pointer items-center justify-center rounded-full text-site-envy"
          aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
          onClick={() => {
            if (paused) {
              autoplay.play()
              setPaused(false)
            } else {
              autoplay.stop()
              setPaused(true)
            }
          }}
        >
          <MorphIcon icon={paused ? Play : Pause} size={16} strokeWidth={2} spring="smooth" />
        </button>
      )}
    </div>
  )
}

const arrowClass =
  'flex size-11 items-center justify-center rounded-full text-site-gray-nurse ring-1 ring-site-mulled-wine smooth enabled:cursor-pointer enabled:hover:text-site-envy enabled:hover:ring-site-envy disabled:cursor-not-allowed disabled:opacity-40'

/** Previous and next buttons, each off at its end. When every slide fits, there is nothing to show. */
function CarouselArrows({
  className,
  previousLabel = 'Previous slide',
  nextLabel = 'Next slide'
}: {
  className?: string
  previousLabel?: string
  nextLabel?: string
}) {
  const { api } = useCarousel()
  const [scroll, setScroll] = React.useState<{ previous: boolean; next: boolean } | null>(null)

  React.useEffect(() => {
    if (!api) return

    const onChange = (emblaApi: CarouselApi) => {
      if (!emblaApi) return
      setScroll({ previous: emblaApi.canScrollPrev(), next: emblaApi.canScrollNext() })
    }

    onChange(api)
    api.on('reInit', onChange)
    api.on('select', onChange)

    return () => {
      api.off('reInit', onChange)
      api.off('select', onChange)
    }
  }, [api])

  if (scroll && !scroll.previous && !scroll.next) return null

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        aria-label={previousLabel}
        disabled={!scroll?.previous}
        className={arrowClass}
        onClick={() => api?.scrollPrev()}
      >
        <MorphIcon icon={ChevronLeft} size={22} strokeWidth={2.25} />
      </button>
      <button type="button" aria-label={nextLabel} disabled={!scroll?.next} className={arrowClass} onClick={() => api?.scrollNext()}>
        <MorphIcon icon={ChevronRight} size={22} strokeWidth={2.25} />
      </button>
    </div>
  )
}

export { Carousel, CarouselArrows, CarouselContent, CarouselItem, CarouselDots }
