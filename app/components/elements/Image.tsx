import { forwardRef, type ImgHTMLAttributes } from 'react'
import { isLocalRasterSrc, pictureSourceWidths, rasterVariantSrc } from '~/services/responsiveImage'

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> & {
  src: string
  alt: string
  width: number
  height: number
  maxwidth?: number
}

function resolveSrc(src: string) {
  return src.startsWith('/public/') ? src.slice('/public'.length) : src
}

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image({ src, alt, width, height, maxwidth, ...props }, ref) {
  const resolved = resolveSrc(src)
  const img = (
    // eslint-disable-next-line no-restricted-syntax -- Image is the allowed primitive wrapper
    <img ref={ref} src={resolved} alt={alt} width={width} height={height} {...props} />
  )

  if (!isLocalRasterSrc(resolved)) {
    return img
  }

  const [large, medium, small] = pictureSourceWidths(maxwidth ?? width)

  return (
    <picture className="contents">
      <source type="image/webp" media={`(max-width: ${small}px)`} srcSet={rasterVariantSrc(resolved, small)} width={small} />
      <source type="image/webp" media={`(max-width: ${medium}px)`} srcSet={rasterVariantSrc(resolved, medium)} width={medium} />
      <source type="image/webp" media={`(min-width: ${medium}.98px)`} srcSet={rasterVariantSrc(resolved, large)} width={large} />
      {img}
    </picture>
  )
})

export default Image
