import * as React from 'react'
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react'
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

function CarouselContent({ className, ...props }: React.ComponentProps<'div'>) {
  const { carouselRef } = useCarousel()

  return (
    <div ref={carouselRef} className="overflow-hidden">
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
  const [playing, setPlaying] = React.useState(false)

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

    const syncAutoplay = () => {
      setPlaying(Boolean(api.plugins()?.autoplay?.isPlaying()))
    }

    onInit(api)
    onSelect(api)
    syncAutoplay()
    api.on('reInit', onInit)
    api.on('reInit', onSelect)
    api.on('reInit', syncAutoplay)
    api.on('select', onSelect)
    api.on('autoplay:play', syncAutoplay)
    api.on('autoplay:stop', syncAutoplay)

    return () => {
      api.off('reInit', onInit)
      api.off('reInit', onSelect)
      api.off('reInit', syncAutoplay)
      api.off('select', onSelect)
      api.off('autoplay:play', syncAutoplay)
      api.off('autoplay:stop', syncAutoplay)
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
              className={cn(
                'size-2.5 rounded-full',
                index === selectedIndex ? 'bg-site-ginger-brown' : 'border-2 border-site-ginger-brown bg-transparent'
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
      {autoplay && (
        <button
          type="button"
          className="flex size-6 cursor-pointer items-center justify-center rounded-full text-site-ginger-brown"
          aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
          onClick={() => (playing ? autoplay.stop() : autoplay.play())}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      )}
    </div>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  )
}

export { Carousel, CarouselContent, CarouselItem, CarouselDots }
