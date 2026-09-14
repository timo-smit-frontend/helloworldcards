import { describe, expect, it } from 'vitest'
import {
  formatMarktplaatsVraagprijs,
  marktplaatsBiddingFromShop,
  marktplaatsBiedenVanafFromShop,
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

describe('marktplaatsBiddingFromShop', () => {
  it('takes €5 off under €100 and puts the minimum bid one step lower, less a cent', () => {
    expect(marktplaatsBiddingFromShop('€45')).toEqual({ minimumBid: 34.99, counterOffer: 40 })
    expect(marktplaatsBiddingFromShop('€65')).toEqual({ minimumBid: 54.99, counterOffer: 60 })
    expect(marktplaatsBiddingFromShop('€95')).toEqual({ minimumBid: 84.99, counterOffer: 90 })
  })

  it('takes €10 off from €100 up', () => {
    expect(marktplaatsBiddingFromShop('€100')).toEqual({ minimumBid: 84.99, counterOffer: 90 })
    expect(marktplaatsBiddingFromShop('€110')).toEqual({ minimumBid: 94.99, counterOffer: 100 })
    expect(marktplaatsBiddingFromShop('€130')).toEqual({ minimumBid: 114.99, counterOffer: 120 })
  })

  it('rounds the floor up to a whole €5 so the discount never exceeds the maximum', () => {
    expect(marktplaatsBiddingFromShop('€48')).toEqual({ minimumBid: 39.99, counterOffer: 45 })
    expect(marktplaatsBiddingFromShop('€102')).toEqual({ minimumBid: 89.99, counterOffer: 95 })
    expect(marktplaatsBiddingFromShop(100)).toEqual({ minimumBid: 84.99, counterOffer: 90 })
  })

  it('returns null when there is no price or no room to bid', () => {
    expect(marktplaatsBiddingFromShop(undefined)).toBeNull()
    expect(marktplaatsBiddingFromShop('')).toBeNull()
    expect(marktplaatsBiddingFromShop('€10')).toBeNull()
  })
})

describe('marktplaatsBiedenVanafFromShop', () => {
  it('maps shop prices to the Bieden vanaf field', () => {
    expect(marktplaatsBiedenVanafFromShop('€100')).toBe('84,99')
    expect(marktplaatsBiedenVanafFromShop('€90')).toBe('79,99')
    expect(marktplaatsBiedenVanafFromShop('€45')).toBe('34,99')
    expect(marktplaatsBiedenVanafFromShop(undefined)).toBeNull()
  })
})
