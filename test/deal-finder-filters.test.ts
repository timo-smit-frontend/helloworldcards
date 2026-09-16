import { describe, expect, it } from 'vitest'
import { screenListing } from '~/services/deal-finder/filters'
import type { SourceListing } from '~/services/deal-finder/types'

const NO_OWN_LISTINGS = { marktplaats: new Set<string>(), vinted: new Set<string>() }

/** A Vinted catalogue row: a title and a price, and no description at all. */
function vintedRow(title: string, ask = 80): SourceListing {
  return {
    id: 'vinted:1',
    source: 'vinted',
    listingId: '1',
    title,
    description: null,
    ask,
    listingUrl: 'https://www.vinted.nl/items/1-slug',
    sellerName: null,
    sellerId: null,
    priceType: 'FIXED',
    imageUrls: ['https://images1.vinted.net/t/1/f800/a.jpeg'],
    itemType: null,
    shipping: null,
    listedOn: null
  }
}

function screen(title: string, ask?: number) {
  return screenListing(vintedRow(title, ask), NO_OWN_LISTINGS)
}

describe('screening a listing', () => {
  describe('a title that names PSA without a grade', () => {
    /**
     * Vinted rows carry no description, so the grade a seller only wrote there cannot be
     * seen at screening time. The photos can still settle it, so the listing goes through.
     */
    it('is kept for the label reader rather than written off', () => {
      expect(screen('Mega charizard X ex mega attack Japanese PSA')).toEqual({ keep: true })
    })

    it('is still dropped when the seller says it is not PSA', () => {
      expect(screen('Pokémon MEGA Dream ex Rayquaza m2a 127 RGS 9 no PSA')).toMatchObject({
        keep: false,
        reason: 'Seller says the slab is not PSA'
      })
    })

    it('is still dropped when another grader slabbed it', () => {
      expect(screen('Pokemon Carte Gradée Collect Aura 10 PSA style')).toMatchObject({
        keep: false,
        reason: 'Graded by COLLECT AURA, not PSA'
      })
      expect(screen('Charizard CGC 9.5 gem mint')).toMatchObject({ keep: false, reason: 'Graded by CGC, not PSA' })
    })

    it('is still dropped when the grade is only what the seller hopes for', () => {
      expect(screen('Charizard, mogelijk PSA 10 waard')).toMatchObject({
        keep: false,
        reason: 'Raw card, the PSA grade is only what the seller expects'
      })
    })

    it('is still dropped when it is a display case rather than a card', () => {
      expect(screen('Vitrine à cartes Pokémon PSA, one touch et classique')).toMatchObject({
        keep: false,
        reason: 'Selling a case or sleeve, not a card'
      })
    })
  })

  it('drops a title that names no grader at all', () => {
    expect(screen('Pokemon lotto ex full art')).toMatchObject({ keep: false, reason: 'Not a PSA 9 or 10 listing' })
  })

  it('keeps a real PSA grade even where a rival grader is mentioned beside it', () => {
    expect(screen('Charizard PSA 10 (not CGC, not BGS)')).toEqual({ keep: true })
  })

  it('still reads the grade it can see', () => {
    expect(screen('Pokemon Torkoal AR PSA 10 Gem Mint 069/066')).toEqual({ keep: true })
    expect(screen('Pokemon Comfey PSA 5')).toMatchObject({ keep: false, reason: 'Graded PSA 5, not 9 or 10' })
  })

  describe('Japanese cards are only bought in PSA 10', () => {
    it('drops a Japanese PSA 9 named in the title', () => {
      expect(screen('Pikachu 197 Japans PSA 9')).toMatchObject({
        keep: false,
        scope: 'out-of-scope',
        reason: 'Japanese PSA 9, we only buy Japanese cards in PSA 10'
      })
    })

    it('keeps a Japanese PSA 10 and an English PSA 9', () => {
      expect(screen('Pikachu 197 Japanese PSA 10')).toEqual({ keep: true })
      expect(screen('Charizard 4/102 PSA 9')).toEqual({ keep: true })
    })

    it('leaves a Japanese title with no grade for the slab to settle', () => {
      expect(screen('Mega Charizard X ex Japanese PSA')).toEqual({ keep: true })
    })
  })
})

describe('accessories that photograph like a card', () => {
  it('drops a multipack of sleeves whatever language it is sold in', () => {
    expect(screen('Pack 10 protectores PSA holográficos')).toMatchObject({
      keep: false,
      reason: 'Selling a case or sleeve, not a card'
    })
  })

  it('keeps a card that merely comes with one', () => {
    expect(screen('Charizard PSA 10 incl. toploader')).toEqual({ keep: true })
    expect(screen('Pikachu PSA 9 met protector')).toEqual({ keep: true })
  })
})
