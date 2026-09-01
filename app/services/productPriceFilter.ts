import { parseListedPrice } from './price'

export type PriceRange = {
  min: number
  max: number
}

export function catalogPriceBounds<T extends { price?: string | number }>(products: T[]): PriceRange | null {
  const prices = products.map((product) => parseListedPrice(product.price)).filter((price): price is number => price != null)

  if (prices.length === 0) {
    return null
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices)
  }
}

function parseBound(value: string | null, fallback: number): number {
  if (value == null || value === '') {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function parsePriceRangeParams(searchParams: URLSearchParams, bounds: PriceRange): PriceRange {
  let min = Math.min(bounds.max, Math.max(bounds.min, parseBound(searchParams.get('min'), bounds.min)))
  let max = Math.min(bounds.max, Math.max(bounds.min, parseBound(searchParams.get('max'), bounds.max)))

  if (min > max) {
    ;[min, max] = [max, min]
  }

  return { min, max }
}

export function applyPriceRangeSearchParams(current: URLSearchParams, range: PriceRange, bounds: PriceRange): URLSearchParams {
  const params = new URLSearchParams(current)
  params.delete('min')
  params.delete('max')
  params.delete('page')

  if (range.min > bounds.min) {
    params.set('min', String(range.min))
  }

  if (range.max < bounds.max) {
    params.set('max', String(range.max))
  }

  return params
}

export function priceAtRatio(ratio: number, bounds: PriceRange): number {
  const clamped = Math.min(1, Math.max(0, ratio))
  return Math.round(bounds.min + clamped * (bounds.max - bounds.min))
}

export function rangeAfterTrackClick(ratio: number, range: PriceRange, bounds: PriceRange): { range: PriceRange; thumb: 'min' | 'max' } {
  const price = priceAtRatio(ratio, bounds)

  if (ratio < 0.5) {
    return { range: { min: Math.min(price, range.max), max: range.max }, thumb: 'min' }
  }

  return { range: { min: range.min, max: Math.max(price, range.min) }, thumb: 'max' }
}

export function ratioAtPrice(value: number, bounds: PriceRange): number {
  if (bounds.max === bounds.min) {
    return 0
  }

  return (value - bounds.min) / (bounds.max - bounds.min)
}

export const PRICE_RANGE_THUMB_SIZE = 20

export function thumbCenterOffset(ratio: number, trackWidth: number, thumbSize = PRICE_RANGE_THUMB_SIZE): number {
  const clamped = Math.min(1, Math.max(0, ratio))
  const travel = Math.max(0, trackWidth - thumbSize)
  return thumbSize / 2 + clamped * travel
}

export function thumbCenterStyle(ratio: number, thumbSize = PRICE_RANGE_THUMB_SIZE): { left: string } {
  return { left: `calc(${thumbSize / 2}px + ${ratio} * (100% - ${thumbSize}px))` }
}

export function livePriceFitsBetweenBounds({
  ratio,
  liveWidth,
  minWidth,
  maxWidth,
  trackWidth,
  thumbSize = PRICE_RANGE_THUMB_SIZE,
  gap = 4
}: {
  ratio: number
  liveWidth: number
  minWidth: number
  maxWidth: number
  trackWidth: number
  thumbSize?: number
  gap?: number
}): boolean {
  if (trackWidth <= 0 || liveWidth <= 0) {
    return false
  }

  const center = thumbCenterOffset(ratio, trackWidth, thumbSize)
  const liveLeft = center - liveWidth / 2
  const liveRight = center + liveWidth / 2

  return liveLeft >= minWidth + gap && liveRight <= trackWidth - maxWidth - gap
}

export function filterProductsByPrice<T extends { price?: string | number }>(products: T[], range: PriceRange): T[] {
  return products.filter((product) => {
    const price = parseListedPrice(product.price)
    return price != null && price >= range.min && price <= range.max
  })
}
