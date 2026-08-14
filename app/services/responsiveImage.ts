export const IMAGE_SCALING_FACTORS = [1, 1.5, 2.75] as const
export const BUILD_MAXWIDTHS = [400, 600, 800, 1000, 1200, 1280, 1600, 1920, 2000] as const

const LOCAL_RASTER = /\.(png|jpe?g|webp)$/i
const VARIANT_PATH = /^(.*)-w(\d+)\.webp$/

export function getFluidWidths(maxWidth: number): [number, number, number] {
  return [
    Math.round(maxWidth / IMAGE_SCALING_FACTORS[0]),
    Math.round(maxWidth / IMAGE_SCALING_FACTORS[1]),
    Math.round(maxWidth / IMAGE_SCALING_FACTORS[2])
  ]
}

export function variantWidthsFor(): number[] {
  const widths = new Set<number>()
  for (const maxWidth of BUILD_MAXWIDTHS) {
    for (const width of getFluidWidths(maxWidth)) {
      widths.add(width)
    }
  }
  return [...widths]
}

function snapWidth(desired: number, available: number[]): number {
  const sorted = [...available].sort((a, b) => a - b)
  return sorted.find((width) => width >= desired) ?? sorted[sorted.length - 1]
}

export function pictureSourceWidths(maxWidth: number): [number, number, number] {
  const available = variantWidthsFor()
  return getFluidWidths(maxWidth).map((width) => snapWidth(width, available)) as [number, number, number]
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
