import { describe, expect, it } from 'vitest'
import { POKEMON_NAMES } from '~/services/deal-finder/pokemon-names'
import {
  characterGate,
  mentionsCharacter,
  offListReason,
  POPULAR_TRAINERS,
  tidyCardName,
  TOP_CHARACTERS,
  TOP_POKEMON,
  topCharacter
} from '~/services/deal-finder/popular'

describe('the top list', () => {
  it('is a hundred Pokémon, every one of them a real species', () => {
    expect(TOP_POKEMON).toHaveLength(100)
    const species = new Set(POKEMON_NAMES.map((name) => name.toLowerCase()))
    expect(TOP_POKEMON.filter((name) => !species.has(name.toLowerCase()))).toEqual([])
  })

  it('has no duplicates', () => {
    const seen = TOP_CHARACTERS.map((name) => name.toLowerCase())
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('names every species once', () => {
    expect(POKEMON_NAMES).toHaveLength(1025)
    expect(POKEMON_NAMES[24]).toBe('Pikachu')
    expect(POKEMON_NAMES).toContain('Ho-Oh')
    expect(POKEMON_NAMES).toContain('Mr. Mime')
  })
})

describe('topCharacter', () => {
  it('finds the character inside whatever the set did to it', () => {
    expect(topCharacter('Umbreon VMAX')).toBe('Umbreon')
    expect(topCharacter('Mega Gardevoir ex')).toBe('Gardevoir')
    expect(topCharacter('Dark Charizard')).toBe('Charizard')
    expect(topCharacter('Hisuian Zoroark VSTAR')).toBe('Zoroark')
    expect(topCharacter("Team Rocket's Mewtwo ex")).toBe('Mewtwo')
  })

  it('reads a PSA label row', () => {
    expect(topCharacter('FA/PIKACHU V')).toBe('Pikachu')
    expect(topCharacter('HO-OH')).toBe('Ho-Oh')
  })

  it('never reads a longer name as a shorter one', () => {
    expect(topCharacter('Mewtwo')).toBe('Mewtwo')
    expect(topCharacter('Mew ex')).toBe('Mew')
    expect(topCharacter('Zoroark GX')).toBe('Zoroark')
  })

  it('finds a character Vision ran into one word, when the name is long enough not to be luck', () => {
    expect(topCharacter('FAMEWTWOEX')).toBe('Mewtwo')
    expect(topCharacter('MEGAGENGAREX')).toBe('Gengar')
  })

  it('counts the popular trainers and their Pokémon', () => {
    expect(POPULAR_TRAINERS).toContain('Lillie')
    expect(topCharacter('Lillie Full Art')).toBe('Lillie')
    expect(topCharacter("Iono's Bellibolt ex")).toBe('Iono')
  })

  it('leaves everything off the list alone', () => {
    expect(topCharacter('Wobbuffet')).toBeNull()
    expect(topCharacter('Iron Valiant ex')).toBeNull()
    expect(topCharacter("N'S RESHIRAM")).toBe('Reshiram')
    expect(topCharacter('Nidoking')).toBeNull()
    expect(topCharacter('')).toBeNull()
    expect(topCharacter(null)).toBeNull()
  })
})

describe('characterGate', () => {
  it('lets through a title naming a character on the list', () => {
    expect(characterGate('Umbreon VMAX 215/203 Evolving Skies PSA 10')).toEqual({ verdict: 'top', character: 'Umbreon' })
  })

  it('drops a title naming only Pokémon off the list', () => {
    expect(characterGate("Team Rocket's Nidoking ex PSA 10")).toEqual({ verdict: 'other', names: ['Nidoking'] })
    expect(characterGate('Pachirisu 208 PSA 9')).toEqual({ verdict: 'other', names: ['Pachirisu'] })
  })

  it('leaves a title naming no Pokémon to the slab', () => {
    expect(characterGate('PSA 10 Japanse promo kaart')).toEqual({ verdict: 'unknown' })
  })

  it('says which card was off the list', () => {
    expect(offListReason(['Nidoking'])).toBe('Not a top-100 Pokémon (Nidoking)')
  })
})

describe('mentionsCharacter', () => {
  it('matches whole words only', () => {
    expect(mentionsCharacter('Mew ex 151 PSA 10', 'Mew')).toBe(true)
    expect(mentionsCharacter('Mewtwo ex PSA 10', 'Mew')).toBe(false)
  })
})

describe('tidyCardName', () => {
  it('puts a run-together label row back together', () => {
    expect(tidyCardName('FAMEWTWOEX')).toBe('Mewtwo ex')
    expect(tidyCardName('UMBREONVMAX')).toBe('Umbreon VMAX')
  })

  it('leaves a name that reads fine as it is', () => {
    expect(tidyCardName('Umbreon VMAX')).toBe('Umbreon VMAX')
    expect(tidyCardName('Wobbuffet')).toBe('Wobbuffet')
  })
})
