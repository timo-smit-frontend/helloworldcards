import { describe, expect, it } from 'vitest'
import {
  buildDealDisplayTitle,
  buildTitleFallbackQuery,
  filterMarktplaatsCandidates,
  formatDealDisplayTitle,
  isFirstEditionListing,
  parseCardmarketProductName,
  parseCardmarketProductSlug,
  parseMarktplaatsTitle,
  shouldExcludeMarktplaatsListing
} from '~/services/marktplaats-deals/titles'
import type { MarktplaatsOverviewListing } from '~/services/marktplaats-deals/html'

function listing(
  overrides: Partial<MarktplaatsOverviewListing> & Pick<MarktplaatsOverviewListing, 'title' | 'ask'>
): MarktplaatsOverviewListing {
  return {
    marktplaatsUrl: 'https://www.marktplaats.nl/v/example',
    sellerName: 'Seller',
    priceType: 'MIN_BID',
    imageUrl: 'https://images.example/slab.jpg',
    ...overrides
  }
}

describe('isFirstEditionListing', () => {
  it('recognizes 1st edition wording in a seller title', () => {
    expect(isFirstEditionListing('Ekans Team Rocket 1st Edition PSA 9')).toBe(true)
    expect(isFirstEditionListing('Charizard Base Set First Edition PSA 9')).toBe(true)
    expect(isFirstEditionListing('Charizard Base Set 1e editie PSA 9')).toBe(true)
  })

  it('leaves ordinary unlimited-print titles unflagged', () => {
    expect(isFirstEditionListing('Charizard GX SM211 PSA 9 MINT Pokémon Kaart')).toBe(false)
  })
})

describe('parseMarktplaatsTitle', () => {
  it('extracts pokemon name, card number, set name, and grade', () => {
    expect(parseMarktplaatsTitle('Pokemon Chansey 015/113 PSA 9 Mint - 2023 CLV EN')).toEqual({
      pokemonName: 'Chansey',
      cardNumber: '015',
      cardNumberRaw: '015/113',
      setName: 'CLV',
      grade: 9,
      language: 'english'
    })
  })

  it('extracts set name from inline title text', () => {
    expect(parseMarktplaatsTitle('Gengar Pokémon Fossil #20 PSA 9 Mint 1999')).toMatchObject({
      pokemonName: 'Gengar',
      cardNumber: '20',
      setName: 'Fossil'
    })
  })

  it('detects japanese listings', () => {
    expect(parseMarktplaatsTitle('Pokemon 151 SV2a JP Charizard ex PSA 9')).toMatchObject({
      pokemonName: expect.stringContaining('Charizard ex'),
      grade: 9,
      language: 'japanese'
    })
  })

  it('treats Japonais / Japanse titles as japanese', () => {
    expect(parseMarktplaatsTitle('Méga Ectoplasma ex 230/193 MA – PSA 9 – Japonais M2a')).toMatchObject({
      language: 'japanese'
    })
  })
})

describe('buildDealDisplayTitle', () => {
  it('uses the Cardmarket slug when the listing title lacks a set code', () => {
    expect(
      buildDealDisplayTitle({
        title: 'Ivysaur Art Rare #065 PSA 10 JP',
        grade: 10,
        cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Mega-Brave/Ivysaur-V2-m1L065'
      })
    ).toBe('Ivysaur (m1L 065) JP - PSA 10')
  })

  it('formats common English and promo listings', () => {
    expect(
      buildDealDisplayTitle({
        title: 'Charizard GX SM211 PSA 9 MINT EN',
        grade: 9,
        cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/SM-Black-Star-Promos/Charizard-GX-V1-SM211'
      })
    ).toBe('Charizard GX (SM211) EN - PSA 9')

    expect(
      buildDealDisplayTitle({
        title: 'Pokémon Pikachu V SWSH #145 PSA 9 MINT Gold Kaart',
        grade: 9,
        cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Pikachu-V-V5'
      })
    ).toBe('Pikachu V (SWSH 145) EN - PSA 9')

    expect(
      buildDealDisplayTitle({
        title: 'Gengar Pokémon Fossil #20 PSA 9 Mint 1999',
        grade: 9,
        cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Fossil/Gengar-V1-FO20'
      })
    ).toBe('Gengar (Fossil 20) EN - PSA 9')
  })

  it('formats japanese listings with set codes from title or slug', () => {
    expect(
      buildDealDisplayTitle({
        title: 'Latios 2024 SV7a JP Japanese Pokemon card #70 70 Art Rare PSA 10 Gem mt',
        grade: 10,
        cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Paradise-Dragona/Latios-V2-sv7a070'
      })
    ).toBe('Latios (sv7a 070) JP - PSA 10')
  })

  it('formats Alakazam, Glaceon, and Mega Gengar from listing + Cardmarket slug', () => {
    expect(
      buildDealDisplayTitle({
        title: 'Alakazam ex SHINY ULTRA RARE PSA 9 - 2024 Pokemon PAF EN',
        grade: 9,
        cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Paldean-Fates/Alakazam-ex-PAF215'
      })
    ).toBe('Alakazam ex (PAF 215) EN - PSA 9')

    expect(
      buildDealDisplayTitle({
        title: 'Japanse Glaceon V #270. Pokemon. Pokemonkaart. PSA 10',
        grade: 10,
        cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Sword-Shield-Promos/Glaceon-V-S-P270'
      })
    ).toBe('Glaceon V (S-P 270) JP - PSA 10')

    expect(
      buildDealDisplayTitle({
        title: 'Méga Ectoplasma ex 230/193 MA – PSA 9 – Japonais M2a',
        grade: 9,
        cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEGA-Dream-ex/Mega-Gengar-ex-V1-m2a230'
      })
    ).toBe('Mega Gengar ex (m2a 230) JP - PSA 9')
  })
})

describe('parseCardmarketProductSlug', () => {
  it('reads set codes from Cardmarket product slugs', () => {
    expect(
      parseCardmarketProductSlug(
        'https://www.cardmarket.com/en/Pokemon/Products/Singles/Pokemon-Trading-Card-Game-Classic-Venusaur-Lugia-ex-Deck/Chansey-CLV015'
      )
    ).toEqual({ setCode: 'CLV', cardNumber: '015' })

    expect(
      parseCardmarketProductSlug(
        'https://www.cardmarket.com/en/Pokemon/Products/Singles/Sword-Shield-Promos/Glaceon-V-S-P270'
      )
    ).toEqual({ setCode: 'S-P', cardNumber: '270' })
  })
})

describe('parseCardmarketProductName', () => {
  it('reads the English product name from the slug', () => {
    expect(
      parseCardmarketProductName(
        'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEGA-Dream-ex/Mega-Gengar-ex-V1-m2a230'
      )
    ).toBe('Mega Gengar ex')

    expect(
      parseCardmarketProductName(
        'https://www.cardmarket.com/en/Pokemon/Products/Singles/Paradise-Dragona/Latios-V2-sv7a070'
      )
    ).toBe('Latios')
  })
})

describe('formatDealDisplayTitle', () => {
  it('formats a Cardmarket-style title with set code and card number', () => {
    const parsed = parseMarktplaatsTitle('Pokemon Chansey 015/113 PSA 9 Mint - 2023 CLV EN')!
    expect(formatDealDisplayTitle(parsed)).toBe('Chansey (CLV 015) EN - PSA 9')
  })

  it('formats japanese set codes and drops Art Rare from the name', () => {
    expect(formatDealDisplayTitle(parseMarktplaatsTitle('2025 pokemon M1L jp ivysaur art rare #065 PSA 10')!)).toBe(
      'Ivysaur (M1L 065) JP - PSA 10'
    )
    expect(formatDealDisplayTitle(parseMarktplaatsTitle('Ivysaur Art Rare #065 PSA 10 JP')!)).toBe('Ivysaur (065) JP - PSA 10')
  })
})

describe('buildTitleFallbackQuery', () => {
  it('builds a Google query from parsed title fields', () => {
    const parsed = parseMarktplaatsTitle('Gengar Pokémon Fossil #20 PSA 9 Mint 1999')!
    expect(buildTitleFallbackQuery(parsed)).toBe('Gengar Fossil #20 english cardmarket')
  })

  it('keeps CLV in the query and uses the card number only', () => {
    const parsed = parseMarktplaatsTitle('Pokemon Chansey 015/113 PSA 9 Mint - 2023 CLV EN')!
    expect(buildTitleFallbackQuery(parsed)).toBe('Chansey CLV #015 english cardmarket')
  })

  it('returns null when the title has no card number', () => {
    const parsed = parseMarktplaatsTitle('Vaporeon VMAX PSA 9 Mint Pokémon Kaart')!
    expect(buildTitleFallbackQuery(parsed)).toBeNull()
  })

  it('falls back with a set code when the title has no card number', () => {
    const parsed = parseMarktplaatsTitle('Pokemon Leafeon ex SV8a JP PSA 10 Gem Mint')!
    expect(parsed?.setName).toMatch(/SV8a/i)
    expect(buildTitleFallbackQuery(parsed!)).toMatch(/Leafeon ex SV8a japanese cardmarket/i)
  })

  it('reads sv-p promo numbers and cleans empty parentheses', () => {
    expect(parseMarktplaatsTitle('Leafeon sv-p 068 - PSA 10 - Yu Nagaba Collection')).toMatchObject({
      pokemonName: expect.stringMatching(/Leafeon/i),
      cardNumber: '068'
    })
    expect(parseMarktplaatsTitle('Gengar EX (TEF #193) PSA 9 mint')).toMatchObject({
      pokemonName: 'Gengar EX',
      cardNumber: '193',
      setName: 'TEF'
    })
    expect(buildTitleFallbackQuery(parseMarktplaatsTitle('Gengar EX (TEF #193) PSA 9 mint')!)).toBe(
      'Gengar EX TEF #193 english cardmarket'
    )
  })

  it('parses titles that put the card name after PSA', () => {
    expect(
      parseMarktplaatsTitle("2022 psa 10 full art roseanne's backup star birth pokemon s9 116 japanese")
    ).toMatchObject({
      grade: 10,
      language: 'japanese',
      cardNumber: '116',
      pokemonName: expect.stringMatching(/roseanne/i)
    })
  })
})

describe('filterMarktplaatsCandidates', () => {
  it('keeps single PSA cards and skips lots, catawiki, and sub-minimum asks', () => {
    const { candidates, skipped } = filterMarktplaatsCandidates([
      listing({ title: 'Vaporeon VMAX PSA 9 Mint Pokémon Kaart', ask: 110 }),
      listing({ title: 'Pokémon - 3 Graded card - PSA 10 - Various sets', ask: 42, sellerName: 'Catawiki' }),
      listing({ title: 'Pokemon PSA Lijstje/Houder', ask: 10, priceType: 'FIXED' }),
      listing({ title: 'Charizard GX SM211 PSA 9 MINT Pokémon Kaart', ask: 8 })
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.title).toContain('Vaporeon')
    expect(skipped.some((row) => /Various sets/i.test(row.title))).toBe(true)
    expect(skipped.some((row) => /Houder/i.test(row.title))).toBe(true)
    expect(skipped.some((row) => row.reason === 'Ask below minimum')).toBe(true)
  })

  it('skips German, French, and other non EN/JP card languages', () => {
    const { candidates, skipped } = filterMarktplaatsCandidates([
      listing({ title: 'Strahlendes Stahlos 124/196 Verlorener Ursprung DE PSA 9', ask: 80 }),
      listing({ title: 'Carte Pokémon Raichu 36/108 Holo FR PSA 9', ask: 40 }),
      listing({ title: 'Charizard GX SM211 PSA 9 MINT EN', ask: 35 }),
      listing({ title: 'Ivysaur Art Rare #065 PSA 10 JP', ask: 100 })
    ])

    expect(candidates.map((row) => row.title)).toEqual(['Charizard GX SM211 PSA 9 MINT EN', 'Ivysaur Art Rare #065 PSA 10 JP'])
    expect(skipped.every((row) => row.reason === 'Not English or Japanese')).toBe(true)
    expect(skipped).toHaveLength(2)
  })

  it('skips listings above the €200 search cap', () => {
    const { candidates, skipped } = filterMarktplaatsCandidates([
      listing({ title: 'Gengar Pokémon Fossil #20 PSA 9 Mint 1999', ask: 350 }),
      listing({ title: 'Charizard GX SM211 PSA 9 MINT EN', ask: 35 })
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.title).toContain('Charizard')
    expect(skipped[0]?.reason).toBe('Ask above maximum')
  })

  it('skips auction listings without a fixed price', () => {
    expect(shouldExcludeMarktplaatsListing(listing({ title: 'Pikachu PSA 9', ask: 50, priceType: 'FAST_BID' }))).toBe('No fixed price')
  })
})
