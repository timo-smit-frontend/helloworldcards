import { describe, expect, it } from 'vitest'
import { parseListingCardNumber, parseSetSizeFromFraction } from '~/services/marktplaats-deals/card-number'

describe('parseListingCardNumber', () => {
  it('uses only the numerator from listing fractions', () => {
    expect(parseListingCardNumber('015/113')).toBe('015')
    expect(parseListingCardNumber('230/193')).toBe('230')
  })

  it('passes through promo codes unchanged', () => {
    expect(parseListingCardNumber('SM211')).toBe('SM211')
  })
})

describe('parseSetSizeFromFraction', () => {
  it('reads the denominator as set size', () => {
    expect(parseSetSizeFromFraction('015/113')).toBe(113)
  })
})
