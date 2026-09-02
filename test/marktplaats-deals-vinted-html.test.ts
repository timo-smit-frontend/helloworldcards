import { describe, expect, it } from 'vitest'
import { parseVintedHoverTitle, parseVintedOverview, titleFromVintedSlug } from '~/services/marktplaats-deals/vinted-html'

const overviewFixture = `
<div data-testid="product-item-id-9863102973">
  <div data-testid="product-item-id-9863102973--image">
    <img data-testid="product-item-id-9863102973--image--img"
      src="https://images1.vinted.net/example.webp"
      alt="Méga Ectoplasma ex 230/193 MA – PSA 9 – Japonais M2a, Merk: Pokémon, Staat: Nieuw zonder prijskaartje, 55.00 €, 58.45 €" />
  </div>
  <a href="/items/9863102973-mega-ectoplasma-ex-230193-ma-psa-9-japonais-m2a?referrer=catalog"
    data-testid="product-item-id-9863102973--overlay-link"
    title="Méga Ectoplasma ex 230/193 MA – PSA 9 – Japonais M2a, Merk: Pokémon, Staat: Nieuw zonder prijskaartje, 55.00 €, 58.45 €"></a>
</div>
<div data-testid="product-item-id-9863050408">
  <img data-testid="product-item-id-9863050408--image--img"
    src="https://images1.vinted.net/pikachu.webp"
    alt="Pokemon Pikachu Mcdonalds Promo 2025 Burguerchu graded psa 10 Japan, Merk: Pokémon, Staat: Heel goed, 110.00 €, 116.20 €" />
  <a href="/items/9863050408-pokemon-pikachu-mcdonalds-promo-2025-burguerchu-graded-psa-10-japan?referrer=catalog"
    data-testid="product-item-id-9863050408--overlay-link"
    title="Pokemon Pikachu Mcdonalds Promo 2025 Burguerchu graded psa 10 Japan, Merk: Pokémon, Staat: Heel goed, 110.00 €, 116.20 €"></a>
</div>
`

describe('parseVintedHoverTitle', () => {
  it('reads the card title and ask from the hover string', () => {
    expect(
      parseVintedHoverTitle(
        'Méga Ectoplasma ex 230/193 MA – PSA 9 – Japonais M2a, Merk: Pokémon, Staat: Nieuw zonder prijskaartje, 55.00 €, 58.45 €'
      )
    ).toEqual({
      title: 'Méga Ectoplasma ex 230/193 MA – PSA 9 – Japonais M2a',
      ask: 55
    })
  })
})

describe('titleFromVintedSlug', () => {
  it('builds a fallback title from the listing slug', () => {
    expect(titleFromVintedSlug('mega-ectoplasma-ex-230193-ma-psa-9-japonais-m2a')).toBe(
      'mega ectoplasma ex 230193 ma psa 9 japonais m2a'
    )
  })
})

describe('parseVintedOverview', () => {
  it('reads title, price, url, and image from catalog HTML', () => {
    const listings = parseVintedOverview(overviewFixture)

    expect(listings).toHaveLength(2)
    expect(listings[0]).toEqual({
      itemId: '9863102973',
      title: 'Méga Ectoplasma ex 230/193 MA – PSA 9 – Japonais M2a',
      ask: 55,
      vintedUrl: 'https://www.vinted.nl/items/9863102973-mega-ectoplasma-ex-230193-ma-psa-9-japonais-m2a',
      imageUrl: 'https://images1.vinted.net/example.webp'
    })
    expect(listings[1]?.title).toContain('psa 10')
  })
})
