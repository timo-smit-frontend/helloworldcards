import { describe, expect, it } from 'vitest'
import {
  applyPriceRangeSearchParams,
  catalogPriceBounds,
  filterProductsByPrice,
  livePriceFitsBetweenBounds,
  parsePriceRangeParams,
  priceAtRatio,
  rangeAfterTrackClick,
  ratioAtPrice,
  thumbCenterOffset
} from '~/services/productPriceFilter'

const products = [{ id: 1, price: '€45' }, { id: 2, price: '€70' }, { id: 3, price: '€125' }, { id: 4 }]

describe('catalogPriceBounds', () => {
  it('uses the lowest and highest listed prices', () => {
    expect(catalogPriceBounds(products)).toEqual({ min: 45, max: 125 })
  })

  it('returns null when nothing has a listed price', () => {
    expect(catalogPriceBounds([{}])).toBeNull()
  })
})

describe('parsePriceRangeParams', () => {
  const bounds = { min: 45, max: 125 }

  it('defaults to the catalog bounds when params are missing', () => {
    expect(parsePriceRangeParams(new URLSearchParams(), bounds)).toEqual({ min: 45, max: 125 })
  })

  it('reads min and max from the query string', () => {
    expect(parsePriceRangeParams(new URLSearchParams('min=50&max=100'), bounds)).toEqual({ min: 50, max: 100 })
  })

  it('clamps values to the catalog bounds', () => {
    expect(parsePriceRangeParams(new URLSearchParams('min=10&max=200'), bounds)).toEqual({ min: 45, max: 125 })
  })

  it('ignores non-numeric values', () => {
    expect(parsePriceRangeParams(new URLSearchParams('min=foo&max=100'), bounds)).toEqual({ min: 45, max: 100 })
  })

  it('swaps min and max when they are reversed', () => {
    expect(parsePriceRangeParams(new URLSearchParams('min=100&max=50'), bounds)).toEqual({ min: 50, max: 100 })
  })
})

describe('applyPriceRangeSearchParams', () => {
  const bounds = { min: 45, max: 125 }

  it('omits params when the range is the full catalog', () => {
    const params = applyPriceRangeSearchParams(new URLSearchParams('min=50'), { min: 45, max: 125 }, bounds)
    expect(params.toString()).toBe('')
  })

  it('writes only the narrowed sides', () => {
    expect(applyPriceRangeSearchParams(new URLSearchParams(), { min: 50, max: 125 }, bounds).toString()).toBe('min=50')
    expect(applyPriceRangeSearchParams(new URLSearchParams(), { min: 45, max: 100 }, bounds).toString()).toBe('max=100')
    expect(applyPriceRangeSearchParams(new URLSearchParams(), { min: 50, max: 100 }, bounds).toString()).toBe('min=50&max=100')
  })

  it('keeps unrelated search params', () => {
    const params = applyPriceRangeSearchParams(new URLSearchParams('ref=home'), { min: 50, max: 100 }, bounds)
    expect(params.get('ref')).toBe('home')
    expect(params.get('min')).toBe('50')
    expect(params.get('max')).toBe('100')
  })

  it('resets pagination when the price range changes', () => {
    const params = applyPriceRangeSearchParams(new URLSearchParams('page=2&min=50'), { min: 60, max: 125 }, bounds)
    expect(params.get('page')).toBeNull()
    expect(params.get('min')).toBe('60')
  })
})

describe('priceAtRatio', () => {
  const bounds = { min: 45, max: 125 }

  it('maps a click on the track to a listed price', () => {
    expect(priceAtRatio(0, bounds)).toBe(45)
    expect(priceAtRatio(1, bounds)).toBe(125)
    expect(priceAtRatio(0.5, bounds)).toBe(85)
  })

  it('clamps clicks that fall outside the track', () => {
    expect(priceAtRatio(-0.2, bounds)).toBe(45)
    expect(priceAtRatio(1.4, bounds)).toBe(125)
  })
})

describe('ratioAtPrice', () => {
  const bounds = { min: 45, max: 125 }

  it('places a listed price along the track', () => {
    expect(ratioAtPrice(45, bounds)).toBe(0)
    expect(ratioAtPrice(125, bounds)).toBe(1)
    expect(ratioAtPrice(85, bounds)).toBe(0.5)
  })
})

describe('thumbCenterOffset', () => {
  it('matches the native range thumb travel', () => {
    expect(thumbCenterOffset(0, 320, 20)).toBe(10)
    expect(thumbCenterOffset(1, 320, 20)).toBe(310)
    expect(thumbCenterOffset(0.5, 320, 20)).toBe(160)
  })
})

describe('livePriceFitsBetweenBounds', () => {
  it('hides the live price when it would cover the end labels', () => {
    expect(livePriceFitsBetweenBounds({ ratio: 0, liveWidth: 28, minWidth: 24, maxWidth: 32, trackWidth: 320 })).toBe(false)
    expect(livePriceFitsBetweenBounds({ ratio: 1, liveWidth: 28, minWidth: 24, maxWidth: 32, trackWidth: 320 })).toBe(false)
  })

  it('keeps the live price when it sits between the end labels', () => {
    expect(livePriceFitsBetweenBounds({ ratio: 0.5, liveWidth: 28, minWidth: 24, maxWidth: 32, trackWidth: 320 })).toBe(true)
  })
})

describe('rangeAfterTrackClick', () => {
  const bounds = { min: 45, max: 125 }
  const range = { min: 45, max: 125 }

  it('moves the minimum thumb when the click is on the left half', () => {
    expect(rangeAfterTrackClick(0.25, range, bounds)).toEqual({
      range: { min: 65, max: 125 },
      thumb: 'min'
    })
  })

  it('moves the maximum thumb when the click is on the right half', () => {
    expect(rangeAfterTrackClick(0.75, range, bounds)).toEqual({
      range: { min: 45, max: 105 },
      thumb: 'max'
    })
  })
})

describe('filterProductsByPrice', () => {
  it('keeps products whose listed price is inside the range', () => {
    expect(filterProductsByPrice(products, { min: 50, max: 100 }).map((product) => product.id)).toEqual([2])
  })

  it('includes products on the range edges', () => {
    expect(filterProductsByPrice(products, { min: 45, max: 70 }).map((product) => product.id)).toEqual([1, 2])
  })

  it('drops products without a listed price', () => {
    expect(filterProductsByPrice(products, { min: 45, max: 125 }).map((product) => product.id)).toEqual([1, 2, 3])
  })
})
