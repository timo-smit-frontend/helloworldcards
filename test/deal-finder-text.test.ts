import { describe, expect, it } from 'vitest'
import {
  detectAllGrades,
  detectAnyGrade,
  detectCardName,
  detectCardNumber,
  detectGrade,
  isSpeculativeGrade,
  looksUngraded,
  detectLanguage,
  detectSet,
  isJapaneseSetCode,
  looksLikeLot,
  normalizeCardNumber
} from '~/services/deal-finder/text'

/** Read a title the way the scan does: grade, set, then the number, then the name. */
function parse(title: string) {
  const set = detectSet(title)
  const cardNumber = detectCardNumber(title, set.matched)
  return {
    grade: detectGrade(title),
    language: detectLanguage(title) ?? (isJapaneseSetCode(set.code) ? 'japanese' : 'english'),
    set: set.name,
    cardNumber,
    name: detectCardName(title, set.matched, cardNumber)
  }
}

describe('detectGrade', () => {
  it('reads the grade however the seller wrote it', () => {
    expect(detectGrade('Charizard PSA 10')).toBe(10)
    expect(detectGrade('charizard psa10 gem mint')).toBe(10)
    expect(detectGrade('Pikachu PSA GEM MT 10')).toBe(10)
    expect(detectGrade('Pikachu PSA MINT 9')).toBe(9)
  })

  it('ignores grades we do not buy but still reports them', () => {
    expect(detectGrade('Fearow psa 8 gym')).toBeNull()
    expect(detectAnyGrade('Fearow psa 8 gym')).toBe(8)
    expect(detectGrade('Blastoise PSA 9.5')).toBeNull()
    expect(detectAnyGrade('Blastoise PSA 9.5')).toBe(9.5)
  })

  it('ignores a grade the seller only hopes for', () => {
    for (const title of [
      'Mega Latias ex PSA 10 mogelijk',
      'Mega Latias ex mogelijk PSA 10',
      'Charizard, PSA 10 possible',
      'Umbreon VMAX potential PSA 10',
      'Pikachu PSA 10 waardig',
      'Snorlax PSA 10?',
      'Mega Latias ex, zou zeker een PSA 10 moeten zijn',
      'Blastoise PSA 10 haalbaar',
      'Gengar should get a PSA 10',
      'Meowth (106) PSA 10 contender',
      'Meowth ex (107) contender for PSA 10',
      'Eevee PSA 10 kanshebber'
    ]) {
      expect(detectGrade(title), title).toBeNull()
      expect(detectAnyGrade(title), title).toBeNull()
      expect(isSpeculativeGrade(title), title).toBe(true)
    }
  })

  it('ignores a grade the seller merely promises', () => {
    // A guarantee is no more a slab than a guess: this Kyurem ex was pack-fresh and loose.
    for (const title of [
      'Kyurem ex 165/086, de kaart is in uitstekende staat gegarandeerd psa 10',
      'Charizard, PSA 10 gegarandeerd',
      'Umbreon VMAX met garantie PSA 10',
      'Snorlax guaranteed PSA 10',
      'Gengar PSA 10 guaranteed'
    ]) {
      expect(detectGrade(title), title).toBeNull()
      expect(isSpeculativeGrade(title), title).toBe(true)
    }

    // The postage is what is guaranteed here, not the slab.
    expect(detectGrade('Charizard PSA 10, gegarandeerd snel verzonden')).toBe(10)
  })

  it('reads a seller saying the card is not slabbed at all', () => {
    expect(looksUngraded('Mega Latias ex, niet gegradeerd, PSA 10 waardig')).toBe(true)
    expect(looksUngraded('Charizard ungraded raw card')).toBe(true)
    // Straight out of the pack is straight past the grader.
    expect(looksUngraded('Kyurem ex 165/086 packfresh')).toBe(true)
    expect(looksUngraded('Charizard PSA 10, zelf laten graden bij PSA')).toBe(false)
  })

  it('still reads a real slab sold beside a raw card', () => {
    const text = 'Charizard PSA 10 slab, plus a raw Blastoise (PSA 10 possible)'
    expect(detectGrade(text)).toBe(10)
    expect(isSpeculativeGrade(text)).toBe(false)
    expect(looksLikeLot(text)).toBe(false)
  })
})

describe('detectLanguage', () => {
  it('recognises Japanese however it is written', () => {
    for (const title of ['Pikachu 197 Japans PSA 10', 'suicune psa 10 jap', 'PSA 10 JPN Pikachu', 'psa 10 japanese flaaffy']) {
      expect(detectLanguage(title)).toBe('japanese')
    }
  })

  it('flags cards in a language we do not buy', () => {
    expect(detectLanguage('eevee 173 promo psa 9 ita – evoluzioni prismatiche')).toBe('other')
    expect(detectLanguage('Carte Pokémon Simiabraz Rare Holo Français')).toBe('other')
  })

  it('reads a listing written in another language as that language', () => {
    // No language named anywhere — but nobody sells an English card in French.
    expect(detectLanguage('Vends Amphinobi GX 120, carte en excellent état')).toBe('other')
    expect(detectLanguage('Verkaufe Glurak Karte, sehr guter Zustand')).toBe('other')
    expect(detectLanguage('Vendo carta Charizard, condizioni ottime')).toBe('other')
  })

  it('does not mistake ordinary Dutch and English words for a language code', () => {
    // "de" and "it" cost us real English cards when they were treated as codes.
    expect(detectLanguage('Charmander uit de 151 set, psa 9')).toBeNull()
    expect(detectLanguage('Mega Gengar ex, it is a PSA 10')).toBeNull()
  })

  it('treats Japanese expansion codes as Japanese', () => {
    expect(isJapaneseSetCode('s8b')).toBe(true)
    expect(isJapaneseSetCode('sv2a')).toBe(true)
    expect(isJapaneseSetCode('m2a')).toBe(true)
    // SM211 is an English Sun & Moon promo, not a Japanese set code.
    expect(isJapaneseSetCode('SM211')).toBe(false)
  })

  it('treats a promo code ending in -P as Japanese', () => {
    // Japanese promos are `160/XY-P`; the English promos of the same eras are `XY160`
    // and `SWSH039`, so the dash and the P are the whole difference.
    expect(isJapaneseSetCode('XY-P')).toBe(true)
    expect(isJapaneseSetCode('S-P')).toBe(true)
    expect(isJapaneseSetCode('SM-P')).toBe(true)
    expect(isJapaneseSetCode('XY')).toBe(false)
    expect(isJapaneseSetCode('SWSH')).toBe(false)
  })
})

describe('detectCardNumber', () => {
  it('never mistakes the grade, the year or a price for a card number', () => {
    expect(parse('Pikachu 197 Japans PSA 10').cardNumber).toBe('197')
    expect(parse('psa 10 2021 japanese fusion arts 125 full art flaaffy').cardNumber).toBe('125')
    expect(parse('PSA 10 2022 paradigm trigger 124 full art leafy japanese').cardNumber).toBe('124')
  })

  it('will not take a lone small number out of prose', () => {
    // "gegradeerd als mint 9 door psa" used to come back as card #9.
    expect(detectCardNumber('Twee kaarten, beide gegradeerd als mint 9 door psa')).toBeNull()
    expect(detectCardNumber('Mega attack rare 10 beoordeeld door psa')).toBeNull()
  })

  it('only takes a number the description states outright when asked', () => {
    expect(detectCardNumber('kaart 199/165 uit de 151 set', null, { allowBare: false })).toBe('199')
    expect(detectCardNumber('een mooie kaart, 145 euro', null, { allowBare: false })).toBeNull()
  })

  it('reads a Japanese promo, which writes the number before the set', () => {
    // `160/XY-P` is not a fraction, so the number used to go unread — and a promo with
    // no number to contradict it was priced against a special art of the same name.
    expect(detectCardNumber('zeldzame Mega Lucario EX kaart (160/XY-P)', null, { allowBare: false })).toBe('160')
    expect(detectCardNumber('Pikachu 001/SM-P promo', null, { allowBare: false })).toBe('001')
    expect(detectCardNumber('Charizard 068/S-P', null, { allowBare: false })).toBe('068')
  })

  it('takes the numerator of a fraction', () => {
    expect(parse('Pokémon Charmander 168/165 Scarlet & Violet 151 PSA 9').cardNumber).toBe('168')
    expect(normalizeCardNumber('015/113')).toBe('015')
  })

  it('reads hash, no. and promo forms', () => {
    expect(parse('Umbreon ex | PSA 9 | Holo | Promo | 2025 | #176').cardNumber).toBe('176')
    expect(parse('Lt.surge Fearow psa 9 no.022 gym').cardNumber).toBe('022')
    expect(parse('Pikachu SV-P 001 - SV Promo - PSA 10 JP').cardNumber).toBe('001')
  })

  it('reads the number after a set code', () => {
    expect(parse('PSA 10 Umbreon Vmax (s8b 245)').cardNumber).toBe('245')
    expect(parse("N'S Reshiram 109 - SV9 - PSA 10 JP").cardNumber).toBe('109')
  })

  it('does not read a set name that looks like a number', () => {
    // "Scarlet & Violet 151" is the set; 168/165 is the card.
    expect(parse('Pokémon Charmander 168/165 Scarlet & Violet 151 PSA 9').set).toBe('Scarlet & Violet 151')
  })
})

describe('Vinted prices', () => {
  it('never reads the amount Vinted prints before the euro sign as a card number', () => {
    expect(detectCardNumber('Gengar PSA Pokemon Slab, Staat: Heel goed, 25.00 €, 26.95 €')).toBeNull()
  })
})

describe('Mew', () => {
  it('is the Pokémon, not the 151 set, unless it is written as a set code', () => {
    // Read as set MEW, the Pokémon's name was stripped out of its own card: "ex".
    expect(parse('Mew ex 151/165 PSA 10')).toMatchObject({ set: null, cardNumber: '151', name: 'Mew ex' })
    expect(detectSet('Gengar PSA 8, kijk ook naar mijn Mew').code).toBeNull()
  })

  it('still names the set when the code comes before a number or sits in brackets', () => {
    expect(detectSet('Charmander MEW 168 PSA 9').code).toBe('MEW')
    expect(detectSet('Charmander 168/165 151 (MEW) PSA 9').code).toBe('MEW')
  })
})

describe('detectAllGrades', () => {
  it('lists every PSA grade the text names, once each', () => {
    expect(detectAllGrades('Gengar PSA 8. Ook te koop: Mew PSA 10')).toEqual([8, 10])
    expect(detectAllGrades('PSA 10 gem mint, echt een psa10')).toEqual([10])
  })

  it('leaves out a grade the seller only hopes for', () => {
    expect(detectAllGrades('PSA 9 slab, de andere is PSA 10 waardig')).toEqual([9])
  })
})

describe('detectSet', () => {
  it('prefers the expansion over the era it belongs to', () => {
    expect(parse('psa 10 2021 japanese sword & shield fusion arts 125 flaaffy').set).toBe('fusion arts')
    expect(parse('PSA 10 2022 sword & shield paradigm trigger 124 leafy japanese').set).toBe('paradigm trigger')
  })

  it('does not read a set name that is sitting inside a longer one', () => {
    // The 2025 Mega Evolution set ends in the name of the 2016 Evolutions set, and a
    // Mega Lucario EX was priced against Evolutions because of it.
    expect(parse('PSA 10 Mega Lucario EX - Mega Evolutions').set).toBe('Mega Evolutions')
    expect(parse('Sylveon 156 Prismatic Evolutions PSA 10').set).toBe('Prismatic Evolutions')
    expect(parse('Pikachu 20 Evolutions PSA 9').set).toBe('Evolutions')
  })
})

describe('detectCardName', () => {
  it('leaves the card name and drops the packaging words', () => {
    expect(parse('Pokémon Charmander 168/165 Scarlet & Violet 151 PSA 9').name).toBe('Charmander')
    expect(parse('Pokemon Chansey 015/113 PSA 9 Mint - 2023 CLV EN').name).toBe('Chansey')
    expect(parse('psa 10 2021 japanese sword & shield fusion arts 125 full art flaaffy pokemon').name).toBe('flaaffy')
  })
})

describe('looksLikeLot', () => {
  it('spots two named cards joined in one title', () => {
    // The seller ticked "single card" on this one, so the title is all we have.
    expect(looksLikeLot('Pokémon Kaarten: Pikachu V & Wigglytuff GX (PSA 9)')).toBe(true)
    expect(looksLikeLot('Umbreon ex | PSA 9 | Holo | Promo | #176')).toBe(false)
    expect(looksLikeLot('Pokémon Charmander 168/165 Scarlet & Violet 151 PSA 9')).toBe(false)
  })

  it('spots listings holding more than one card', () => {
    expect(looksLikeLot('#3 PSA 10 - Espeon #175 & Umbreon #176')).toBe(true)
    expect(looksLikeLot('Pokémon - 3 Graded card - Various sets')).toBe(true)
    expect(looksLikeLot('Pokémon Jungle 1st Edition Jigglypuff PSA 6 & Meowth PSA 9')).toBe(true)
    expect(looksLikeLot('Pokémon Charmander 168/165 PSA 9')).toBe(false)
  })
})
