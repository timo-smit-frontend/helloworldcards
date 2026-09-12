import { useEffect, useRef, useState, type ComponentProps } from 'react'
import Image from '~/components/elements/Image'
import { cn } from '~/services/utils'

type SkeletonImageProps = ComponentProps<typeof Image> & {
  /** Sizes the placeholder to the box the loaded image will occupy, so surrounding layout doesn't shift. */
  skeletonClassName: string
}

/** An Image that shows a pulsing placeholder in its slot until the picture has loaded. */
export default function SkeletonImage({ skeletonClassName, className, onLoad, ...props }: SkeletonImageProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)

  // Cached images can finish before React attaches onLoad, so check on mount too.
  useEffect(() => {
    const el = imgRef.current
    if (el?.complete && el.naturalWidth > 0) setLoaded(true)
  }, [])

  // Placeholder and image share one grid cell so the unloaded <img> never adds height below the placeholder.
  return (
    <div className="grid w-full place-items-center">
      {!loaded && (
        <div
          aria-hidden
          className={cn(
            'col-start-1 row-start-1 animate-pulse rounded-panel bg-site-mulled-wine/60 motion-reduce:animate-none',
            skeletonClassName
          )}
        />
      )}
      <div className="col-start-1 row-start-1 flex w-full justify-center">
        <Image
          {...props}
          ref={imgRef}
          className={cn('transition-opacity duration-200', !loaded && 'opacity-0', className)}
          onLoad={(event) => {
            setLoaded(true)
            onLoad?.(event)
          }}
        />
      </div>
    </div>
  )
}
