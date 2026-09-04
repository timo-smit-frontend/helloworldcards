import { describe, expect, it } from 'vitest'
import {
  buildSearchQuery,
  cardmarketProductName,
  cleanCardmarketUrl,
  googleSearchUrl,
  pickCardmarketProduct
} from '~/services/deal-finder/google'
import { normalizePsaLabel } from '~/services/deal-finder/psa-label'
import type { CardIdentity } from '~/services/deal-finder/types'

function identity(overrides: Partial<CardIdentity> = {}): CardIdentity {
  return {
    name: 'Charmander',
    cardNumber: '168',
    setName: '151',
    setCode: 'MEW',
    language: 'english',
    grade: 9,
    reverseHolo: false,
    firstEdition: false,
    certNumber: null,
    signals: ['title'],
    confidence: 'medium',
    ...overrides
  }
}

describe('buildSearchQuery', () => {
  it('searches Google with the word cardmarket, as that finds the product page', () => {
    expect(buildSearchQuery(identity(), null)).toBe('Charmander 151 #168 english cardmarket')
  })

  it('uses the label rows in the order PSA prints them', () => {
    const label = normalizePsaLabel({
      year: '2021',
      setLine: 'POKEMON SWSH BSP',
      cardName: 'FA/PIKACHU V MINT',
      varietyLine: 'CLBRTNS.ULTRA-PREM.COLL',
      cardNumber: '145',
      grade: 9
    })

    expect(buildSearchQuery(identity({ name: 'PIKACHU V', cardNumber: '145' }), label)).toBe(
      '2021 POKEMON SWSH BSP PIKACHU V CLBRTNS.ULTRA-PREM.COLL #145 english cardmarket'
    )
  })

  it('says which language so Cardmarket shows the right printing', () => {
    expect(buildSearchQuery(identity({ language: 'japanese' }), null)).toContain('japanese')
  })

  it('escapes the query into a Google URL', () => {
    expect(googleSearchUrl('Charmander #168 cardmarket')).toBe('https://www.google.com/search?q=Charmander%20%23168%20cardmarket&hl=en')
  })
})

describe('pickCardmarketProduct', () => {
  const link = (set: string, product: string) => `<a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/${set}/${product}">x</a>`

  it('takes the page whose name and number both match', () => {
    const html = [link('Temporal-Forces', 'Salvatore-V3-TEF212'), link('151', 'Charmander-V2-MEW168')].join('')
    expect(pickCardmarketProduct(html, identity())).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charmander-V2-MEW168')
  })

  it('never lets a matching number in another card win', () => {
    // Ekans-TR56 has the number but is the wrong Pokémon.
    const html = [link('Team-Rocket', 'Ekans-TR168'), link('151', 'Charmander-V2-MEW168')].join('')
    expect(pickCardmarketProduct(html, identity())).toContain('Charmander')
  })

  it('avoids Chinese reprints when the card is English', () => {
    const html = [link('Traditional-Chinese-151', 'Charmander-151C168'), link('151', 'Charmander-V2-MEW168')].join('')
    expect(pickCardmarketProduct(html, identity())).toContain('/151/Charmander-V2-MEW168')
  })

  it('never prices an English card against a Japanese-only product', () => {
    // SWSH #145 is the Celebrations promo; the Golden Box is a Japanese product that
    // Cardmarket serves whatever language filter is asked for.
    const html = [link('25th-Anniversary-Golden-Box', 'Pikachu-V-V1'), link('SWSH-Black-Star-Promos', 'Pikachu-V-V5')].join('')

    expect(pickCardmarketProduct(html, identity({ name: 'Pikachu V', cardNumber: '145', setName: 'SWSH', setCode: 'SWSH' }))).toContain(
      'SWSH-Black-Star-Promos'
    )
  })

  it('spots a Japanese printing by its lowercase expansion code', () => {
    const html = [link('MEGA-Dream-ex', 'Mega-Gengar-ex-V2-m2a230'), link('Ascended-Heroes', 'Mega-Gengar-ex-ASC269')].join('')

    expect(pickCardmarketProduct(html, identity({ name: 'Mega Gengar ex', cardNumber: '269', setName: null, setCode: null }))).toContain(
      'ASC269'
    )
    expect(
      pickCardmarketProduct(
        html,
        identity({ name: 'Mega Gengar ex', cardNumber: '230', setName: null, setCode: null, language: 'japanese' })
      )
    ).toContain('m2a230')
  })

  it('prefers the product whose set matches the one the card came from', () => {
    const html = [link('Celebrations', 'Pikachu-V-CEL1'), link('SWSH-Black-Star-Promos', 'Pikachu-V-V5')].join('')

    expect(pickCardmarketProduct(html, identity({ name: 'Pikachu V', cardNumber: '145', setName: 'SWSH', setCode: 'SWSH' }))).toContain(
      'SWSH-Black-Star-Promos'
    )
  })

  it('returns null when Google found no Cardmarket page', () => {
    expect(pickCardmarketProduct('<a href="https://www.ebay.com/x">x</a>', identity())).toBeNull()
  })

  it('strips tracking parameters and points at the English site', () => {
    expect(cleanCardmarketUrl('https://www.cardmarket.com/nl/Pokemon/Products/Singles/151/Charmander?utm=x')).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charmander'
    )
  })
})

describe('cardmarketProductName', () => {
  it('reads the card name back out of the product slug', () => {
    expect(cardmarketProductName('https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Charmander-V2-MEW168')).toBe('Charmander')
    expect(cardmarketProductName('https://www.cardmarket.com/en/Pokemon/Products/Singles/MEGA-Dream-ex/Mega-Gengar-ex-V1-m2a230')).toBe(
      'Mega Gengar ex'
    )
  })
})
