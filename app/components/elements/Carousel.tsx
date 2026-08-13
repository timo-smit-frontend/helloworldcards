import * as React from 'react'
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react'
import { cn } from '~/services/utils'

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

type CarouselProps = {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  setApi?: (api: CarouselApi) => void
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = React.useContext(CarouselContext)

  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />')
  }

  return context
}

function Carousel({ opts, setApi, plugins, className, children, ...props }: React.ComponentProps<'div'> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: 'x'
    },
    plugins
  )
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) return
    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }, [])

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

  React.useEffect(() => {
    if (!api || !setApi) return
    setApi(api)
  }, [api, setApi])

  React.useEffect(() => {
    if (!api) return
    onSelect(api)
    api.on('reInit', onSelect)
    api.on('select', onSelect)

    return () => {
      api?.off('select', onSelect)
    }
  }, [api, onSelect])

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api: api,
        opts,
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext
      }}
    >
      <div
        onKeyDownCapture={handleKeyDown}
        className={cn('relative', className)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  )
}

function CarouselControls() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel()

  return (
    <div className="mb-9 flex gap-2">
      <button
        type="button"
        data-slot="carousel-previous"
        className="size-8 cursor-pointer rounded-full disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canScrollPrev}
        onClick={scrollPrev}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="30" viewBox="0 0 28 30" fill="none">
          <path
            d="M12.4977 14.1125C12.3893 14.2287 12.3032 14.3669 12.2445 14.5193C12.1858 14.6716 12.1555 14.835 12.1555 15C12.1555 15.165 12.1858 15.3284 12.2445 15.4807C12.3032 15.633 12.3893 15.7713 12.4977 15.8875L17.8077 21.6125C17.9162 21.7287 18.0022 21.8669 18.061 22.0193C18.1197 22.1716 18.1499 22.335 18.1499 22.5C18.1499 22.665 18.1197 22.8284 18.061 22.9807C18.0022 23.133 17.9162 23.2713 17.8077 23.3875C17.591 23.6203 17.2978 23.751 16.9921 23.751C16.6865 23.751 16.3933 23.6203 16.1765 23.3875L10.8665 17.65C10.2166 16.9469 9.85156 15.9937 9.85156 15C9.85156 14.0062 10.2166 13.0531 10.8665 12.35L16.1765 6.61249C16.392 6.38156 16.6829 6.25137 16.9864 6.24999C17.1386 6.24903 17.2895 6.28057 17.4305 6.34277C17.5714 6.40498 17.6996 6.49664 17.8077 6.61249C17.9162 6.72869 18.0022 6.86694 18.061 7.01926C18.1197 7.17159 18.1499 7.33497 18.1499 7.49999C18.1499 7.665 18.1197 7.82838 18.061 7.98071C18.0022 8.13303 17.9162 8.27128 17.8077 8.38748L12.4977 14.1125Z"
            className="fill-site-deep-green"
          />
        </svg>
        <span className="sr-only">Previous slide</span>
      </button>
      <button
        type="button"
        data-slot="carousel-next"
        className="size-8 cursor-pointer rounded-full disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canScrollNext}
        onClick={scrollNext}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="30" viewBox="0 0 28 30" fill="none">
          <path
            d="M18.051 12.35L12.741 6.61251C12.5242 6.3797 12.231 6.24902 11.9254 6.24902C11.6197 6.24902 11.3265 6.3797 11.1098 6.61251C11.0013 6.72872 10.9153 6.86697 10.8565 7.01929C10.7978 7.17162 10.7676 7.335 10.7676 7.50001C10.7676 7.66503 10.7978 7.82841 10.8565 7.98074C10.9153 8.13306 11.0013 8.27131 11.1098 8.38751L16.4313 14.1125C16.5398 14.2287 16.6258 14.367 16.6846 14.5193C16.7433 14.6716 16.7735 14.835 16.7735 15C16.7735 15.165 16.7433 15.3284 16.6846 15.4807C16.6258 15.6331 16.5398 15.7713 16.4313 15.8875L11.1098 21.6125C10.8919 21.8462 10.7689 22.1639 10.7679 22.4956C10.7668 22.8273 10.8877 23.1459 11.104 23.3813C11.3203 23.6166 11.6143 23.7495 11.9213 23.7507C12.2283 23.7519 12.5231 23.6212 12.741 23.3875L18.051 17.65C18.7009 16.9469 19.0659 15.9938 19.0659 15C19.0659 14.0063 18.7009 13.0531 18.051 12.35V12.35Z"
            className="fill-site-deep-green"
          />
        </svg>
        <span className="sr-only">Next slide</span>
      </button>
    </div>
  )
}

function CarouselContent({ className, ...props }: React.ComponentProps<'div'>) {
  const { carouselRef } = useCarousel()

  return (
    <div ref={carouselRef} className="overflow-hidden" data-slot="carousel-content">
      <div className={cn('flex', className)} {...props} />
    </div>
  )
}

function CarouselItem({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn('min-w-0 shrink-0 grow-0', className)}
      {...props}
    />
  )
}

function CarouselDots({ className }: { className?: string }) {
  const { api } = useCarousel()
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([])

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

  return (
    <div className={cn('flex justify-center gap-2', className)} role="tablist" aria-label="Slides">
      {scrollSnaps.map((_, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-label={`Go to slide ${index + 1}`}
          aria-selected={index === selectedIndex}
          className={cn(
            'size-3 rounded-full smooth',
            index === selectedIndex ? 'bg-site-deep-green' : 'bg-site-deep-green/30 cursor-pointer hover:bg-site-deep-green/70'
          )}
          onClick={() => api?.scrollTo(index)}
        />
      ))}
    </div>
  )
}

export { type CarouselApi, Carousel, CarouselControls, CarouselContent, CarouselItem, CarouselDots, useCarousel }
