import { describe, expect, it } from 'vitest'
import { isPopularCard, POPULAR_CHARACTERS, splitStar } from '~/services/deal-finder/popular'

describe('isPopularCard', () => {
  it('stars a plain name', () => {
    expect(isPopularCard('Umbreon')).toBe(true)
    expect(isPopularCard('gardevoir')).toBe(true)
  })

  it('stars the character inside whatever the set did to it', () => {
    expect(isPopularCard('Mega Gardevoir ex')).toBe(true)
    expect(isPopularCard('Dark Charizard')).toBe(true)
    expect(isPopularCard('Hisuian Zoroark VSTAR')).toBe(true)
    expect(isPopularCard('Umbreon VMAX')).toBe(true)
    expect(isPopularCard('Radiant Charizard')).toBe(true)
  })

  it('reads a PSA label row', () => {
    expect(isPopularCard('FA/PIKACHU V')).toBe(true)
    expect(isPopularCard('HO-OH')).toBe(true)
    expect(isPopularCard("N'S RESHIRAM")).toBe(false)
  })

  it('never reads a longer name as a shorter one', () => {
    expect(isPopularCard('Mewtwo')).toBe(true)
    expect(isPopularCard('Mew')).toBe(true)
    // Both are on the list, so prove the matcher on a name that is not.
    expect(isPopularCard('Meowscarada')).toBe(false)
    expect(isPopularCard('Zorua')).toBe(false)
  })

  it('leaves everything else unstarred', () => {
    expect(isPopularCard('Wobbuffet')).toBe(false)
    expect(isPopularCard('Iron Valiant ex')).toBe(false)
    expect(isPopularCard('')).toBe(false)
    expect(isPopularCard(null)).toBe(false)
  })

  it('has no duplicates', () => {
    const seen = POPULAR_CHARACTERS.map((name) => name.toLowerCase())
    expect(new Set(seen).size).toBe(seen.length)
  })
})

describe('splitStar', () => {
  it('takes the star off a starred title', () => {
    expect(splitStar('★ Umbreon VMAX (EVS 215) EN — PSA 10')).toEqual({
      starred: true,
      title: 'Umbreon VMAX (EVS 215) EN — PSA 10'
    })
  })

  it('leaves an unstarred title alone', () => {
    expect(splitStar('Wobbuffet (CRZ 92) EN — PSA 9')).toEqual({ starred: false, title: 'Wobbuffet (CRZ 92) EN — PSA 9' })
  })
})
