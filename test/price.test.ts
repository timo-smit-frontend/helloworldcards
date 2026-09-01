import { describe, expect, it } from 'vitest'
import {
  formatMarktplaatsVraagprijs,
  marktplaatsListingEuros,
  marktplaatsVraagprijsFromShop
} from '../app/services/price'

describe('marktplaatsListingEuros', () => {
  it('subtracts one cent from the shop price', () => {
    expect(marktplaatsListingEuros('€100')).toBe(99.99)
    expect(marktplaatsListingEuros('€95')).toBe(94.99)
    expect(marktplaatsListingEuros('€65')).toBe(64.99)
  })

  it('returns null for missing or invalid shop prices', () => {
    expect(marktplaatsListingEuros(undefined)).toBeNull()
    expect(marktplaatsListingEuros('')).toBeNull()
  })
})

describe('formatMarktplaatsVraagprijs', () => {
  it('formats with comma and two decimals', () => {
    expect(formatMarktplaatsVraagprijs(99.99)).toBe('99,99')
    expect(formatMarktplaatsVraagprijs(94.99)).toBe('94,99')
  })
})

describe('marktplaatsVraagprijsFromShop', () => {
  it('maps shop prices to Marktplaats Vraagprijs strings', () => {
    expect(marktplaatsVraagprijsFromShop('€100')).toBe('99,99')
    expect(marktplaatsVraagprijsFromShop('€95')).toBe('94,99')
    expect(marktplaatsVraagprijsFromShop('€65')).toBe('64,99')
  })
})
