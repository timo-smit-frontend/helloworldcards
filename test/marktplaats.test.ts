import { describe, expect, it } from 'vitest'
import {
  extractMarktplaatsItemId,
  marktplaatsEditUrlFromListingUrl,
  marktplaatsSellerViewUrl
} from '../app/services/marktplaats'

describe('extractMarktplaatsItemId', () => {
  it('reads item ids from seller view URLs', () => {
    expect(extractMarktplaatsItemId('https://www.marktplaats.nl/seller/view/m2436896724')).toBe('m2436896724')
    expect(extractMarktplaatsItemId('https://www.marktplaats.nl/seller/view/m2436737465')).toBe('m2436737465')
  })

  it('reads item ids from edit URLs', () => {
    expect(extractMarktplaatsItemId('https://www.marktplaats.nl/plaats/m2436896724/edit')).toBe('m2436896724')
  })

  it('accepts a bare item id', () => {
    expect(extractMarktplaatsItemId('m2436896724')).toBe('m2436896724')
  })

  it('returns null for unrelated URLs', () => {
    expect(extractMarktplaatsItemId('https://www.marktplaats.nl/u/hello-world-cards/25399885/')).toBeNull()
    expect(extractMarktplaatsItemId('')).toBeNull()
  })
})

describe('marktplaatsEditUrlFromListingUrl', () => {
  it('maps seller view URLs to edit URLs', () => {
    expect(marktplaatsEditUrlFromListingUrl('https://www.marktplaats.nl/seller/view/m2436896724')).toBe(
      'https://www.marktplaats.nl/plaats/m2436896724/edit'
    )
    expect(marktplaatsEditUrlFromListingUrl('https://www.marktplaats.nl/seller/view/m2436737465')).toBe(
      'https://www.marktplaats.nl/plaats/m2436737465/edit'
    )
  })
})

describe('marktplaatsSellerViewUrl', () => {
  it('builds the stored listing URL', () => {
    expect(marktplaatsSellerViewUrl('m2436896724')).toBe('https://www.marktplaats.nl/seller/view/m2436896724')
  })
})
