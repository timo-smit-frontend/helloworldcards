import { forwardRef, useLayoutEffect, useRef, useState, type ImgHTMLAttributes, type Ref } from 'react'
import { resolveImageTitle, toMediaSrc } from '~/services/imageCopy'
import {
  DEFAULT_SRCSET_MAX_WIDTH,
  PRIORITY_IMAGE_SIZES,
  isLocalRasterSrc,
  rasterFallbackSrc,
  rasterSrcSet
} from '~/services/responsiveImage'
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
  return toMediaSrc(src)
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

const LAZY_SIZES = `auto, ${PRIORITY_IMAGE_SIZES}`

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, alt, title, width, height, maxwidth, sizes, priority = false, loading, fetchPriority, decoding, className, ...props },
  ref
) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [layoutWidth, setLayoutWidth] = useState(0)
  const resolved = resolveSrc(src)
  const resolvedTitle = resolveImageTitle(resolved, title, alt)
  const maxWidth = maxwidth ?? DEFAULT_SRCSET_MAX_WIDTH
  const resolvedLoading = loading ?? (priority ? 'eager' : 'lazy')
  const isEager = resolvedLoading === 'eager'
  const local = isLocalRasterSrc(resolved)
  const ready = !local || isEager || sizes != null || layoutWidth > 0
  const resolvedSizes = sizes ?? (layoutWidth > 0 ? `${layoutWidth}px` : isEager ? PRIORITY_IMAGE_SIZES : LAZY_SIZES)

  useLayoutEffect(() => {
    if (isEager || sizes != null) return

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
  }, [resolved, isEager, sizes])

  const resolvedFetchPriority = fetchPriority ?? (priority ? 'high' : undefined)
  const imgProps = {
    ...props,
    width,
    height,
    title: resolvedTitle,
    className: cn('min-w-0 max-w-full', className),
    loading: resolvedLoading,
    ...(decoding != null ? { decoding } : isEager ? {} : { decoding: 'async' as const }),
    sizes: resolvedSizes,
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
    <picture className="flex w-full min-w-0 items-center justify-center">
      {ready && <source type="image/avif" srcSet={rasterSrcSet(resolved, maxWidth, 'avif')} sizes={resolvedSizes} />}
      {ready && <source type="image/webp" srcSet={rasterSrcSet(resolved, maxWidth, 'webp')} sizes={resolvedSizes} />}
      {/* eslint-disable-next-line no-restricted-syntax -- Image is the allowed primitive wrapper */}
      <img {...imgProps} src={ready ? rasterFallbackSrc(resolved, maxWidth, 'webp') : undefined} alt={alt} />
    </picture>
  )
})

export default Image
