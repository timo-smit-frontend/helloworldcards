import { describe, expect, it } from 'vitest'
import { parseSlabComment, marketFloorPrice, suggestListedPrice, type MarketListing } from '~/services/cardmarket/grades'

describe('parseSlabComment', () => {
  it('reads a slab that is the whole comment', () => {
    expect(parseSlabComment('PSA 9')).toEqual({ grader: 'psa', grade: 9 })
    expect(parseSlabComment('PSA 10')).toEqual({ grader: 'psa', grade: 10 })
    expect(parseSlabComment('Psa9')).toEqual({ grader: 'psa', grade: 9 })
    expect(parseSlabComment('PSA9')).toEqual({ grader: 'psa', grade: 9 })
    expect(parseSlabComment('BGS 9.5')).toEqual({ grader: 'beckett', grade: 9.5 })
    expect(parseSlabComment('Beckett 9.5 Gem Mint')).toEqual({ grader: 'beckett', grade: 9.5 })
  })

  it('ignores sentences that only mention a grade', () => {
    expect(parseSlabComment('No PSA 10 contender')).toBeNull()
    expect(parseSlabComment('Would be PSA 10')).toBeNull()
    expect(parseSlabComment('Looks like PSA 9')).toBeNull()
    expect(parseSlabComment('not a PSA 10')).toBeNull()
    expect(parseSlabComment('PSA 10 contender')).toBeNull()
  })

  it('ignores other graders and empty comments', () => {
    expect(parseSlabComment('ACE 10')).toBeNull()
    expect(parseSlabComment('CGC 10')).toBeNull()
    expect(parseSlabComment('AOG 8.5 | SN: 2021005598')).toBeNull()
    expect(parseSlabComment('sent in sleeve and toploader')).toBeNull()
    expect(parseSlabComment('')).toBeNull()
  })
})

function listing(overrides: Partial<MarketListing> & Pick<MarketListing, 'id' | 'grader' | 'grade' | 'price'>): MarketListing {
  return {
    seller: 'seller',
    comment: `${overrides.grader === 'psa' ? 'PSA' : 'BGS'} ${overrides.grade}`,
    ...overrides
  }
}

describe('marketFloorPrice', () => {
  it('returns the cheapest same-grade cluster', () => {
    const market = marketFloorPrice({
      grader: 'psa',
      grade: 9,
      listings: [
        listing({ id: 'a', grader: 'psa', grade: 9, price: 70 }),
        listing({ id: 'b', grader: 'psa', grade: 9, price: 110 }),
        listing({ id: 'c', grader: 'psa', grade: 10, price: 40 })
      ]
    })

    expect(market).toMatchObject({ floor: 70 })
    expect(market?.basis.every((item) => item.grade === 9 || item.price >= 59.5)).toBe(true)
  })
})

describe('suggestListedPrice', () => {
  it('suggests up to the cheapest same-grade listing', () => {
    const suggestion = suggestListedPrice({
      grader: 'psa',
      grade: 10,
      listed: 95,
      listings: [
        listing({ id: 'a', grader: 'psa', grade: 9, price: 34.95 }),
        listing({ id: 'b', grader: 'psa', grade: 10, price: 100 }),
        listing({ id: 'c', grader: 'psa', grade: 10, price: 115 })
      ]
    })

    expect(suggestion).toMatchObject({ direction: 'up', target: 100 })
    expect(suggestion?.basis.some((item) => item.price === 100 && item.grade === 10)).toBe(true)
    expect(suggestion?.basis.every((item) => item.grade !== 9)).toBe(true)
  })

  it('suggests down when a same-grade listing undercuts', () => {
    const suggestion = suggestListedPrice({
      grader: 'psa',
      grade: 9,
      listed: 125,
      listings: [listing({ id: 'a', grader: 'psa', grade: 9, price: 110 })]
    })

    expect(suggestion).toEqual(expect.objectContaining({ direction: 'down', target: 110 }))
  })

  it('returns nothing when already even with the cheapest same-grade listing', () => {
    expect(
      suggestListedPrice({
        grader: 'psa',
        grade: 9,
        listed: 70,
        listings: [listing({ id: 'a', grader: 'psa', grade: 9, price: 70 })]
      })
    ).toBeNull()
  })

  it('pulls in a BGS listing only when it sits in the same price cluster', () => {
    const clustered = suggestListedPrice({
      grader: 'psa',
      grade: 9,
      listed: 75,
      listings: [
        listing({ id: 'psa', grader: 'psa', grade: 9, price: 70 }),
        listing({ id: 'bgs', grader: 'beckett', grade: 9.5, price: 68 })
      ]
    })

    expect(clustered).toMatchObject({ direction: 'down', target: 68 })

    const distant = suggestListedPrice({
      grader: 'psa',
      grade: 10,
      listed: 95,
      listings: [
        listing({ id: 'ten', grader: 'psa', grade: 10, price: 100 }),
        listing({ id: 'bgs', grader: 'beckett', grade: 9.5, price: 35 })
      ]
    })

    expect(distant).toMatchObject({ direction: 'up', target: 100 })
    expect(distant?.notes.some((note) => /BGS 9\.5/i.test(note))).toBe(false)
  })

  it('notes a higher grade listed below us without using a fire-sale as the match', () => {
    const suggestion = suggestListedPrice({
      grader: 'psa',
      grade: 9,
      listed: 50,
      listings: [
        listing({ id: 'nines', grader: 'psa', grade: 9, price: 48 }),
        listing({ id: 'ten', grader: 'psa', grade: 10, price: 40, seller: 'DinoHut', comment: 'PSA 10' })
      ]
    })

    expect(suggestion).toMatchObject({ direction: 'down', target: 48 })
    expect(suggestion?.notes.some((note) => /PSA 10/.test(note) && /€40/.test(note))).toBe(true)
  })

  it('returns nothing without same-grade comps', () => {
    expect(
      suggestListedPrice({
        grader: 'beckett',
        grade: 9.5,
        listed: 70,
        listings: [listing({ id: 'psa', grader: 'psa', grade: 10, price: 100 })]
      })
    ).toBeNull()
  })
})
