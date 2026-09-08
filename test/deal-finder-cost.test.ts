import { describe, expect, it } from 'vitest'
import { buyerProtection, listingCost } from '~/services/deal-finder/cost'

describe('buyerProtection', () => {
  it('charges Marktplaats 5% of the purchase', () => {
    expect(buyerProtection('marktplaats', 100)).toBe(5)
    expect(buyerProtection('marktplaats', 300)).toBe(15)
  })

  it('never goes under €0.40 or over €20', () => {
    expect(buyerProtection('marktplaats', 1)).toBe(0.4)
    expect(buyerProtection('marktplaats', 400)).toBe(20)
    expect(buyerProtection('marktplaats', 900)).toBe(20)
  })

  it('adds nothing on Vinted, whose price already carries it', () => {
    expect(buyerProtection('vinted', 100)).toBe(0)
  })
})

describe('listingCost', () => {
  it('adds the protection and the flat postage to a Marktplaats ask', () => {
    expect(listingCost({ source: 'marktplaats', ask: 90, shipping: null })).toEqual({ fee: 4.5, shipping: 4, total: 98.5 })
  })

  it('adds the postage a Vinted listing quotes to its all-in price', () => {
    expect(listingCost({ source: 'vinted', ask: 47.95, shipping: 4.35 })).toEqual({ fee: 0, shipping: 4.35, total: 52.3 })
  })

  it('falls back to the flat postage when the listing quotes none', () => {
    expect(listingCost({ source: 'vinted', ask: 47.95, shipping: null }).total).toBe(51.95)
  })
})
