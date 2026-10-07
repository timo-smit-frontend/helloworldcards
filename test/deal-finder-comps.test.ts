import { describe, expect, it } from 'vitest'
import {
  cardmarketComps,
  compsKey,
  compsQuery,
  ebayComps,
  isSameCard,
  marktplaatsComps,
  marktplaatsCompsUrl,
  rememberedComps,
  type CardFacts
} from '~/services/deal-finder/comps'
import type { EbayItem } from '~/services/deal-finder/ebay'
import type { RememberedListing } from '~/services/deal-finder/memory'

const UMBREON: CardFacts = { name: 'Umbreon VMAX', cardNumber: '215', setName: 'Evolving Skies', language: 'english', grade: 10 }
const JAPANESE_PIKACHU: CardFacts = { name: 'Pikachu', cardNumber: '025', setName: null, language: 'japanese', grade: 10 }
const SEEN = '2026-10-07T12:00:00.000Z'

describe('isSameCard', () => {
  it('takes a listing that states the character, number, grade and language', () => {
    expect(isSameCard({ title: 'Umbreon VMAX 215/203 Evolving Skies PSA 10' }, UMBREON)).toBe(true)
    expect(isSameCard({ title: 'Pikachu 025/SV-P PSA 10 Japans' }, JAPANESE_PIKACHU)).toBe(true)
  })

  it('reads the grade and number off the description when the title leaves them out', () => {
    expect(isSameCard({ title: 'Umbreon VMAX alt art', description: 'Nummer 215/203, gegradeerd PSA 10' }, UMBREON)).toBe(true)
  })

  it('never takes a listing that does not say which card it is', () => {
    expect(isSameCard({ title: 'Umbreon VMAX PSA 10' }, UMBREON)).toBe(false)
  })

  it('never takes another card, grade or language', () => {
    expect(isSameCard({ title: 'Umbreon VMAX 095/203 PSA 10' }, UMBREON)).toBe(false)
    expect(isSameCard({ title: 'Umbreon VMAX 215/203 PSA 9' }, UMBREON)).toBe(false)
    expect(isSameCard({ title: 'Umbreon VMAX 215/203 PSA 10 Japanese' }, UMBREON)).toBe(false)
    expect(isSameCard({ title: 'Pikachu 025 PSA 10' }, JAPANESE_PIKACHU)).toBe(false)
    expect(isSameCard({ title: 'Espeon VMAX 215/203 PSA 10' }, UMBREON)).toBe(false)
  })

  it('never takes a lot, a raw card or a hoped-for grade', () => {
    expect(isSameCard({ title: 'Umbreon VMAX 215 & Espeon VMAX 270 PSA 10' }, UMBREON)).toBe(false)
    expect(isSameCard({ title: 'Umbreon VMAX 215/203 PSA 10 mogelijk' }, UMBREON)).toBe(false)
    expect(isSameCard({ title: 'Umbreon VMAX 215/203 raw card' }, UMBREON)).toBe(false)
    expect(isSameCard({ title: 'Umbreon VMAX 215/203 PSA 10 en PSA 9' }, UMBREON)).toBe(false)
  })

  it('never takes the same number from another set', () => {
    expect(isSameCard({ title: 'Umbreon VMAX 215 Brilliant Stars PSA 10' }, UMBREON)).toBe(false)
  })

  it('reads only a stated language on eBay, where the title is in the seller’s own language', () => {
    expect(isSameCard({ title: 'Pokemon Karte Umbreon VMAX 215/203 PSA 10' }, UMBREON, { languages: 'stated' })).toBe(true)
    expect(isSameCard({ title: 'Pokemon Karte Umbreon VMAX 215/203 PSA 10' }, UMBREON)).toBe(false)
    expect(isSameCard({ title: 'Umbreon VMAX 215/203 PSA 10 Deutsch' }, UMBREON, { languages: 'stated' })).toBe(false)
    expect(isSameCard({ title: 'Pikachu 025 SV-P PSA 10 japanisch' }, JAPANESE_PIKACHU, { languages: 'stated' })).toBe(true)
  })
})

describe('compsKey', () => {
  it('is the same for two spellings of one card, and differs for another set', () => {
    expect(compsKey({ ...UMBREON, name: 'UMBREON VMAX', cardNumber: '215/203' })).toBe(compsKey(UMBREON))
    expect(compsKey({ ...UMBREON, setName: 'Brilliant Stars' })).not.toBe(compsKey(UMBREON))
    expect(compsKey({ ...UMBREON, grade: 9 })).not.toBe(compsKey(UMBREON))
  })
})

describe('the comparison searches', () => {
  it('ask for the character and the number', () => {
    expect(compsQuery(UMBREON)).toBe('Umbreon 215')
    expect(compsQuery({ ...UMBREON, cardNumber: null })).toBeNull()
  })

  it('search all of Marktplaats, not just today under €150', () => {
    const url = new URL(marktplaatsCompsUrl(UMBREON)!)
    expect(url.pathname).toBe('/lrp/api/search')
    expect(url.searchParams.get('query')).toBe('Umbreon 215 psa')
    expect(url.searchParams.getAll('attributeRanges[]')).toEqual(['PriceCents:500:'])
    expect(url.searchParams.getAll('attributesByKey[]')).toEqual([])
  })
})

function marktplaatsPayload(rows: Array<{ id: string; title: string; cents: number; priceType?: string }>): string {
  const listings = rows.map((row) =>
    JSON.stringify({
      itemId: row.id,
      title: row.title,
      vipUrl: `/v/hobby/${row.id}-slug`,
      priceInfo: { priceCents: row.cents, priceType: row.priceType ?? 'FIXED' },
      sellerInformation: { sellerName: 'verkoper', sellerId: 1 }
    })
  )
  return `{"listings":[${listings.join(',')}]}`
}

describe('marktplaatsComps', () => {
  it('keeps the listings that are this card, at what their sellers ask', () => {
    const payload = marktplaatsPayload([
      { id: 'm1', title: 'Umbreon VMAX 215/203 PSA 10', cents: 52500 },
      { id: 'm2', title: 'Umbreon VMAX 095/203 PSA 10', cents: 9000 },
      { id: 'm3', title: 'Umbreon VMAX 215/203 PSA 10', cents: 0, priceType: 'BIDDING' }
    ])

    expect(marktplaatsComps(payload, UMBREON, SEEN)).toEqual([
      {
        id: 'marktplaats:m1',
        source: 'marktplaats',
        price: 525,
        shipping: null,
        title: 'Umbreon VMAX 215/203 PSA 10',
        url: 'https://www.marktplaats.nl/v/hobby/m1-slug',
        seller: 'verkoper',
        country: 'NL',
        seenAt: SEEN
      }
    ])
  })
})

describe('rememberedComps', () => {
  it('prices a remembered Vinted listing at what its seller asks, before Vinted’s fees', () => {
    const row: RememberedListing = {
      id: 'vinted:9',
      source: 'vinted',
      title: 'Umbreon VMAX 215/203 PSA 10',
      ask: 526.45,
      sellerAsk: 500,
      url: 'https://www.vinted.nl/items/9',
      firstSeen: '2026-10-01T09:00:00.000Z',
      lastSeen: '2026-10-02T09:00:00.000Z'
    }

    expect(rememberedComps([row], UMBREON)).toMatchObject([
      { id: 'vinted:9', source: 'vinted', price: 500, seenAt: '2026-10-01T09:00:00.000Z' }
    ])
    expect(rememberedComps([{ ...row, title: 'Umbreon VMAX PSA 10' }], UMBREON)).toEqual([])
  })
})

describe('ebayComps', () => {
  const item = (overrides: Partial<EbayItem>): EbayItem => ({
    itemId: 'v1|1|0',
    title: 'PSA 10 Umbreon VMAX 215/203 Evolving Skies',
    price: 480,
    currency: 'EUR',
    shipping: 12.5,
    url: 'https://www.ebay.de/itm/1',
    seller: 'kartenladen',
    country: 'DE',
    ...overrides
  })

  it('counts what a buyer here pays: the price plus the postage to the Netherlands', () => {
    expect(ebayComps([item({})], UMBREON, SEEN)).toMatchObject([
      { id: 'ebay:v1|1|0', source: 'ebay', price: 492.5, shipping: 12.5, country: 'DE' }
    ])
  })

  it('leaves out sellers outside the EU, whose price leaves out import costs', () => {
    expect(ebayComps([item({ country: 'GB' }), item({ country: 'US' }), item({ country: null })], UMBREON, SEEN)).toEqual([])
  })
})

describe('cardmarketComps', () => {
  it('turns the offers a floor was read from into competitors', () => {
    const comps = cardmarketComps(
      [{ id: '77', seller: 'shop', comment: 'PSA 10', grader: 'psa', grade: 10, price: 499 }],
      'https://cm/offers',
      SEEN
    )
    expect(comps).toEqual([
      {
        id: 'cardmarket:77',
        source: 'cardmarket',
        price: 499,
        shipping: null,
        title: 'PSA 10',
        url: 'https://cm/offers',
        seller: 'shop',
        country: null,
        seenAt: SEEN
      }
    ])
  })
})
