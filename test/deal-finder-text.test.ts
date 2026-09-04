import { describe, expect, it } from 'vitest'
import {
  detectAnyGrade,
  detectCardName,
  detectCardNumber,
  detectGrade,
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

describe('detectSet', () => {
  it('prefers the expansion over the era it belongs to', () => {
    expect(parse('psa 10 2021 japanese sword & shield fusion arts 125 flaaffy').set).toBe('fusion arts')
    expect(parse('PSA 10 2022 sword & shield paradigm trigger 124 leafy japanese').set).toBe('paradigm trigger')
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
