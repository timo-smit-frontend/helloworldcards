import { forwardRef, useLayoutEffect, useRef, useState, type ImgHTMLAttributes, type Ref } from 'react'
import { DEFAULT_SRCSET_MAX_WIDTH, isLocalRasterSrc, rasterFallbackSrc, rasterSrcSet } from '~/services/responsiveImage'
import { cn } from '~/services/utils'

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height' | 'srcSet'> & {
  src: string
  alt: string
  width: number
  height: number
  maxwidth?: number
  priority?: boolean
}

function resolveSrc(src: string) {
  return src.startsWith('/public/') ? src.slice('/public'.length) : src
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

const EAGER_SIZES = '(min-width: 1024px) 50vw, 100vw'
const LAZY_SIZES = `auto, ${EAGER_SIZES}`

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, alt, width, height, maxwidth, sizes, priority = false, loading, fetchPriority, decoding, className, ...props },
  ref
) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [layoutWidth, setLayoutWidth] = useState(0)
  const resolved = resolveSrc(src)
  const maxWidth = maxwidth ?? DEFAULT_SRCSET_MAX_WIDTH
  const resolvedLoading = loading ?? (priority ? 'eager' : 'lazy')
  const isEager = resolvedLoading === 'eager'
  const local = isLocalRasterSrc(resolved)
  const ready = !local || isEager || sizes != null || layoutWidth > 0

  useLayoutEffect(() => {
    const el = imgRef.current
    if (!el) return

    const update = () => {
      const next = Math.round(el.getBoundingClientRect().width)
      if (next > 0) setLayoutWidth((current) => (Math.abs(current - next) < 1 ? current : next))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [resolved])

  const resolvedFetchPriority = fetchPriority ?? (priority ? 'high' : undefined)
  const imgProps = {
    ...props,
    width,
    height,
    className: cn('min-w-0 max-w-full', className),
    loading: resolvedLoading,
    decoding: decoding ?? 'async',
    sizes: sizes ?? (layoutWidth > 0 ? `${layoutWidth}px` : isEager ? EAGER_SIZES : LAZY_SIZES),
    ...(resolvedFetchPriority ? { fetchPriority: resolvedFetchPriority } : {}),
    ref: (node: HTMLImageElement | null) => {
      imgRef.current = node
      assignRef(ref, node)
    }
  }

  if (!local) {
    // eslint-disable-next-line no-restricted-syntax -- Image is the allowed primitive wrapper
    return <img {...imgProps} src={resolved} alt={alt} />
  }

  return (
    // eslint-disable-next-line no-restricted-syntax -- Image is the allowed primitive wrapper
    <img
      {...imgProps}
      src={ready ? rasterFallbackSrc(resolved, maxWidth) : undefined}
      srcSet={ready ? rasterSrcSet(resolved, maxWidth) : undefined}
      alt={alt}
    />
  )
})

export default Image
