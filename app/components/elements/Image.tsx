import { forwardRef, type ImgHTMLAttributes } from 'react'

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> & {
  src: string
  alt: string
  width: number
  height: number
}

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image({ alt, width, height, ...props }, ref) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- Image is the allowed primitive wrapper
    <img ref={ref} alt={alt} width={width} height={height} {...props} />
  )
})

export default Image
