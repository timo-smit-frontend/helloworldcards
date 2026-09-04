import { describe, expect, it } from 'vitest'
import { displayTitle, identifyCard } from '~/services/deal-finder/identify'
import { normalizePsaLabel } from '~/services/deal-finder/psa-label'
import type { SourceListing } from '~/services/deal-finder/types'

function listing(overrides: Partial<SourceListing> = {}): SourceListing {
  return {
    id: 'marktplaats:m1',
    source: 'marktplaats',
    listingId: 'm1',
    title: 'Pokémon Charmander 168/165 Scarlet & Violet 151 PSA 9',
    description: null,
    ask: 120,
    listingUrl: 'https://www.marktplaats.nl/v/hobby/m1',
    sellerName: 'juliano',
    priceType: 'MIN_BID',
    imageUrls: ['https://images.marktplaats.com/a.jpg'],
    itemType: 'Losse kaart',
    ...overrides
  }
}

const label = (overrides: Record<string, unknown> = {}) =>
  normalizePsaLabel({
    year: '2023',
    setLine: 'POKEMON MEW EN',
    cardName: 'CHARMANDER',
    varietyLine: 'ILLUSTRATION RARE',
    cardNumber: '168',
    certNumber: '99887766',
    grade: 9,
    ...overrides
  })

describe('identifyCard', () => {
  it('works the card out from the listing text when there is no readable label', () => {
    const result = identifyCard({ listing: listing(), slabs: [], cert: null, readerNote: null })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity).toMatchObject({
      name: 'Charmander',
      cardNumber: '168',
      setName: 'Scarlet & Violet 151',
      language: 'english',
      grade: 9,
      confidence: 'medium'
    })
  })

  it('lets the slab label override the listing text', () => {
    const result = identifyCard({
      listing: listing({ title: 'Pikachu 197 Japans PSA 10' }),
      slabs: [label({ cardName: 'PIKACHU', setLine: 'POKEMON SV-P JPN.', cardNumber: '197', grade: 10 })],
      cert: null,
      readerNote: null
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity).toMatchObject({
      name: 'PIKACHU',
      cardNumber: '197',
      language: 'japanese',
      grade: 10,
      confidence: 'high'
    })
    expect(result.identity.signals).toContain('psa-label')
  })

  it("prefers PSA's own record over the photo", () => {
    const result = identifyCard({
      listing: listing(),
      slabs: [label({ cardName: 'CHARMELEON' })],
      cert: label({ cardName: 'CHARMANDER' }),
      readerNote: null
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity.name).toBe('CHARMANDER')
    expect(result.identity.signals).toContain('psa-cert')
  })

  it('refuses to price a listing holding more than one slab', () => {
    const result = identifyCard({
      listing: listing({ title: 'Pikachu V & Wigglytuff GX PSA 9' }),
      slabs: [label({ certNumber: '11111111' }), label({ certNumber: '22222222' })],
      cert: null,
      readerNote: null
    })

    expect(result).toMatchObject({ ok: false, scope: 'problem', reason: '2 graded cards in one listing' })
  })

  it('stops when the listing and the slab disagree about the grade', () => {
    const result = identifyCard({
      listing: listing({ title: 'Charmander 168/165 PSA 10' }),
      slabs: [label({ grade: 9 })],
      cert: null,
      readerNote: null
    })

    expect(result).toMatchObject({ ok: false, scope: 'problem' })
    if (result.ok) return
    expect(result.reason).toBe('Listing says PSA 10 but the slab reads PSA 9')
  })

  it('drops cards in a language we do not buy', () => {
    const result = identifyCard({
      listing: listing({ title: 'eevee 173 promo psa 9 ita' }),
      slabs: [label({ setLine: 'POKEMON SVP IT', cardName: 'EEVEE', cardNumber: '173' })],
      cert: null,
      readerNote: null
    })

    expect(result).toMatchObject({ ok: false, scope: 'out-of-scope' })
    if (result.ok) return
    expect(result.reason).toContain('IT')
  })

  it('drops grades other than 9 and 10 without calling them a problem', () => {
    const result = identifyCard({
      listing: listing({ title: 'Fearow psa 8 gym' }),
      slabs: [],
      cert: null,
      readerNote: null
    })

    expect(result).toMatchObject({ ok: false, scope: 'out-of-scope' })
  })

  it('reports a listing it could not pin down to a card', () => {
    const result = identifyCard({
      listing: listing({ title: 'Mooie pokemon kaart PSA 10', description: 'Zie foto' }),
      slabs: [],
      cert: null,
      readerNote: 'Label unreadable through glare.'
    })

    expect(result).toMatchObject({ ok: false, scope: 'problem' })
    if (result.ok) return
    expect(result.detail).toBe('Label unreadable through glare.')
  })
})

/**
 * Every case here comes from a real scan that produced a wrong answer, when the label
 * reader was not configured and only the listing text was available.
 */
describe('reading the listing text alone', () => {
  it('does not read a grade out of the description as the card number', () => {
    const result = identifyCard({
      listing: listing({
        title: 'Pokémon Mega Gengar ex Mega Attack Rare PSA 10 GEM MT',
        description: 'Prachtige mega gengar ex kaart, mega attack rare 10, professioneel beoordeeld door psa.',
        ask: 190
      }),
      slabs: [],
      cert: null,
      readerNote: null
    })

    // Previously this became card #10 and matched a €1800 art variant.
    expect(result).toMatchObject({ ok: false, scope: 'problem' })
    if (result.ok) return
    expect(result.reason).toBe('No card number or set on the listing or the slab')
  })

  it('keeps the card name out of the description', () => {
    const result = identifyCard({
      listing: listing({
        description:
          'Te koop: een prachtige pokémon charmander kaart (168/165) uit de scarlet & violet 151 (mew) set, beoordeeld met een psa 9 (mint).'
      }),
      slabs: [],
      cert: null,
      readerNote: null
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Was "Charmander een charmander uit de", which then went into the Google query.
    expect(result.identity.name).toBe('Charmander')
    expect(result.identity.cardNumber).toBe('168')
  })

  it('still takes a card number the description states outright', () => {
    const result = identifyCard({
      listing: listing({
        title: 'Pokémon Charizard PSA 10',
        description: 'Charizard uit de 151 set, kaart 199/165, psa 10 gem mint.'
      }),
      slabs: [],
      cert: null,
      readerNote: null
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity.cardNumber).toBe('199')
  })

  it('treats a listing written in French as a French card', () => {
    const result = identifyCard({
      listing: listing({
        title: 'Amphinobi GX PSA 10',
        description: 'Vends Amphinobi GX 120, carte en excellent état, envoi rapide.'
      }),
      slabs: [],
      cert: null,
      readerNote: null
    })

    // Amphinobi is Greninja in French; this used to be priced against the English card.
    expect(result).toMatchObject({ ok: false, scope: 'out-of-scope' })
  })
})

describe('displayTitle', () => {
  it('reads like a Cardmarket product', () => {
    const result = identifyCard({ listing: listing(), slabs: [], cert: null, readerNote: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(displayTitle(result.identity)).toBe('Charmander (Scarlet & Violet 151 168) EN — PSA 9')
  })
})
