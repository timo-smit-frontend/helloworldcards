export const BUILD_WIDTHS = [400, 600, 800, 1000, 1200, 1600] as const
export type ImageFormat = 'avif' | 'webp'

const LOCAL_RASTER = /\.(png|jpe?g|webp|avif)$/i
const VARIANT_PATH = /^(.*)-w(\d+)\.(webp|avif)$/

export function variantWidthsFor(): number[] {
  return [...BUILD_WIDTHS]
}

export const DEFAULT_SRCSET_MAX_WIDTH = BUILD_WIDTHS[BUILD_WIDTHS.length - 1]
const FALLBACK_SRC_WIDTH = 800
const PRELOAD_WIDTHS = [400, 800] as const

export const PRIORITY_IMAGE_SIZES = '(min-width: 1024px) 50vw, 100vw'
export const PRODUCT_IMAGE_SIZES = '(min-width: 1024px) 20rem, 16rem'

export function srcSetWidths(maxWidth: number = DEFAULT_SRCSET_MAX_WIDTH): number[] {
  const widths = variantWidthsFor()
    .filter((width) => width <= maxWidth)
    .sort((a, b) => a - b)
  return widths.length > 0 ? widths : [maxWidth]
}

export function preloadSrcSetWidths(maxWidth: number = DEFAULT_SRCSET_MAX_WIDTH): number[] {
  const available = new Set(srcSetWidths(maxWidth))
  const widths = [...PRELOAD_WIDTHS, maxWidth].filter(
    (width, index, all) => width <= maxWidth && available.has(width) && all.indexOf(width) === index
  )
  return widths.length > 0 ? widths : srcSetWidths(maxWidth).slice(-1)
}

export function rasterSrcSet(
  src: string,
  maxWidth: number = DEFAULT_SRCSET_MAX_WIDTH,
  format: ImageFormat = 'webp',
  widths: number[] = srcSetWidths(maxWidth)
): string {
  return widths.map((width) => `${rasterVariantSrc(src, width, format)} ${width}w`).join(', ')
}

export function rasterFallbackSrc(src: string, maxWidth: number = DEFAULT_SRCSET_MAX_WIDTH, format: ImageFormat = 'webp'): string {
  const widths = srcSetWidths(maxWidth)
  const fallback = widths.find((candidate) => candidate >= FALLBACK_SRC_WIDTH) ?? widths[widths.length - 1]
  return rasterVariantSrc(src, fallback, format)
}

export function isLocalRasterSrc(src: string): boolean {
  const path = src.split('?')[0]
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/media/') && LOCAL_RASTER.test(path)
}

export function rasterVariantSrc(src: string, width: number, format: ImageFormat = 'webp'): string {
  return src.replace(LOCAL_RASTER, `-w${width}.${format}`)
}

export function parseRasterVariant(pathname: string): { stem: string; width: number; format: ImageFormat } | null {
  const match = pathname.match(VARIANT_PATH)
  if (!match) return null
  return { stem: match[1], width: Number(match[2]), format: match[3] as ImageFormat }
}

export function buildLcpPreloadTag(src: string, maxWidth: number, sizes: string): string {
  const widths = preloadSrcSetWidths(maxWidth)
  const href = rasterFallbackSrc(src, maxWidth, 'avif')
  const imagesrcset = rasterSrcSet(src, maxWidth, 'avif', widths)
  return `<link rel="preload" as="image" type="image/avif" href="${href}" imagesrcset="${imagesrcset}" imagesizes="${sizes}" fetchpriority="high" />`
}
