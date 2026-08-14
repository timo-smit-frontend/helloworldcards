export const IMAGE_SCALING_FACTORS = [1, 1.5, 2.75] as const

const LOCAL_RASTER = /\.(png|jpe?g|webp)$/i
const VARIANT_PATH = /^(.*)-w(\d+)\.webp$/

export function getFluidWidths(maxWidth: number): [number, number, number] {
  return [
    Math.round(maxWidth / IMAGE_SCALING_FACTORS[0]),
    Math.round(maxWidth / IMAGE_SCALING_FACTORS[1]),
    Math.round(maxWidth / IMAGE_SCALING_FACTORS[2])
  ]
}

export function isLocalRasterSrc(src: string): boolean {
  const path = src.split('?')[0]
  return path.startsWith('/') && !path.startsWith('//') && LOCAL_RASTER.test(path)
}

export function rasterVariantSrc(src: string, width: number): string {
  return src.replace(LOCAL_RASTER, `-w${width}.webp`)
}

export function parseRasterVariant(pathname: string): { stem: string; width: number } | null {
  const match = pathname.match(VARIANT_PATH)
  if (!match) return null
  return { stem: match[1], width: Number(match[2]) }
}
