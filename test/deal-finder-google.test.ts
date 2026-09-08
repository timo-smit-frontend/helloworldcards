import { describe, expect, it } from 'vitest'
import {
  buildSearchQuery,
  cardmarketProductName,
  cardmarketTitleSlugs,
  cleanCardmarketUrl,
  googleSearchUrl,
  pickCardmarketProduct,
  rankCardmarketCandidates,
  scoreCardmarketUrl
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

  it('leaves the slab reader’s debris out of the query', () => {
    // Every one of these rows is a real reading: the slab's printed border and a clipped
    // word came back as `WL`, `ES`, `2LL` and `CR`, which Google searches for in earnest.
    const label = normalizePsaLabel({
      year: '2023',
      setLine: 'POKEMON WL SWSH BSP ES 2LL',
      cardName: 'FA/LUCARIO VSTAR MINT',
      varietyLine: 'CROWN ZENITH ETB CR',
      cardNumber: '291',
      grade: 9
    })

    expect(buildSearchQuery(identity({ name: 'LUCARIO VSTAR', cardNumber: '291' }), label)).toBe(
      '2023 POKEMON SWSH BSP LUCARIO VSTAR CROWN ZENITH ETB #291 english cardmarket'
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

  it('will not price a card against the same name at another number', () => {
    // Erika's Invitation is #39 in the set and #206 as the special art. Same name, same
    // set, nowhere near the same price — so an unmatched number is no answer at all.
    const erika = identity({ name: "Erika's Invitation", cardNumber: '39', setName: 'SV2a', setCode: 'SV2a', language: 'japanese' })

    expect(pickCardmarketProduct(link('Pokemon-Card-151', 'Erikas-Invitation-V3-sv2a206'), erika)).toBeNull()
    expect(pickCardmarketProduct(link('Pokemon-Card-151', 'Erikas-Invitation-sv2a039'), erika)).toContain('sv2a039')
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

/**
 * How Google actually answers now: not one result URL anywhere in the page, only a
 * title and an opaque redirect, sitting in its embedded data as
 * `"<title>",null,"/goto?url=<token>"`. Every one of these titles is a real reading.
 */
function googleResult(title: string, token: string): string {
  return `,[null,null,5,null,"${title}",null,"/goto?url\\u003d${token}",null,null,1]`
}

describe('cardmarketTitleSlugs', () => {
  it('reads the set and the card back out of a Cardmarket result title', () => {
    expect(cardmarketTitleSlugs('Houndour (OBF 204) Obsidian Flames - Singles - Cardmarket')).toEqual({
      setSlug: 'Obsidian-Flames',
      productSlug: 'Houndour-OBF204'
    })
    expect(cardmarketTitleSlugs('Tinkatink (sv2D 076) Clay Burst - Singles - Cardmarket')).toEqual({
      setSlug: 'Clay-Burst',
      productSlug: 'Tinkatink-sv2D076'
    })
    expect(cardmarketTitleSlugs('Dragonite EX (72) - Evolutions - Cardmarket')).toEqual({
      setSlug: 'Evolutions',
      productSlug: 'Dragonite-EX-72'
    })
  })

  it('is not fooled by the species and set pages Cardmarket also ranks for', () => {
    expect(cardmarketTitleSlugs('Houndour - Cardmarket')).toBeNull()
    expect(cardmarketTitleSlugs('Obsidian Flames - Pokémon Singles - Cardmarket')).toBeNull()
    expect(cardmarketTitleSlugs('Houndour #204 Pokemon Obsidian Flames - PriceCharting')).toBeNull()
  })
})

describe('rankCardmarketCandidates', () => {
  const houndour = identity({ name: 'HOUNDOUR', cardNumber: '204', setName: 'Obsidian flames', setCode: 'OBF' })

  it('ranks the results Google hides behind a redirect, best first', () => {
    const html = [
      googleResult('Houndour - Cardmarket', 'AAA'),
      googleResult('Houndour (132) - Obsidian Flames - Cardmarket', 'BBB'),
      googleResult('Houndour (OBF 204) Obsidian Flames - Singles - Cardmarket', 'CCC')
    ].join('')

    const ranked = rankCardmarketCandidates(html, houndour)
    expect(ranked[0]).toMatchObject({ url: 'https://www.google.com/goto?url=CCC', redirect: true })
    // The species page is not a single at all, so only the two products are offered.
    expect(ranked).toHaveLength(2)
  })

  it('drops a result whose title names another card entirely', () => {
    const html = googleResult('Pidgeot ex (OBF 225) Obsidian Flames - Singles - Cardmarket', 'DDD')
    expect(rankCardmarketCandidates(html, houndour)).toEqual([])
  })

  it('still reads a page that does print its links outright', () => {
    const html = '<a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Obsidian-Flames/Houndour-V2-OBF204">x</a>'
    expect(rankCardmarketCandidates(html, houndour)[0]).toMatchObject({ redirect: false })
  })
})

describe('scoreCardmarketUrl', () => {
  it('scores where a redirect landed, and says when it was not a product page', () => {
    const houndour = identity({ name: 'HOUNDOUR', cardNumber: '204', setName: 'Obsidian flames', setCode: 'OBF' })

    expect(
      scoreCardmarketUrl('https://www.cardmarket.com/en/Pokemon/Products/Singles/Obsidian-Flames/Houndour-V2-OBF204', houndour)
    ).toBeGreaterThan(0)
    expect(scoreCardmarketUrl('https://www.cardmarket.com/en/Pokemon/Species/Houndour', houndour)).toBeNull()
    expect(
      scoreCardmarketUrl('https://www.cardmarket.com/en/Pokemon/Products/Singles/Obsidian-Flames/Pidgeot-ex-OBF225', houndour)
    ).toBeLessThan(0)
  })
})
