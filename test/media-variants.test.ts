import { describe, expect, it } from 'vitest'
import { isLocalRasterSrc, mediaVariantKey, rasterFallbackSrc, rasterSrcSet, rasterVariantSrc } from '../app/services/responsiveImage'

describe('isLocalRasterSrc', () => {
  it('treats CMS media paths as local raster sources', () => {
    expect(isLocalRasterSrc('/media/hero.jpg')).toBe(true)
    expect(isLocalRasterSrc('/media/76719295_front.jpg')).toBe(true)
  })

  it('still skips remote and non-raster paths', () => {
    expect(isLocalRasterSrc('https://example.com/card.jpg')).toBe(false)
    expect(isLocalRasterSrc('/media/logo.svg')).toBe(false)
  })
})

describe('media variants for /media/', () => {
  it('builds variant URLs from CMS media paths', () => {
    expect(rasterVariantSrc('/media/hero.jpg', 800, 'webp')).toBe('/media/hero-w800.webp')
    expect(mediaVariantKey('hero.jpg', 800, 'webp')).toBe('hero-w800.webp')
    expect(rasterFallbackSrc('/media/hero.jpg', 1000, 'webp')).toBe('/media/hero-w800.webp')
    expect(rasterSrcSet('/media/hero.jpg', 1000, 'webp')).toContain('/media/hero-w400.webp 400w')
  })
})
