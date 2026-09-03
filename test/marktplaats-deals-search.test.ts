import { describe, expect, it } from 'vitest'
import { firstCardmarketProductUrl, googleSearchUrl, pickCardmarketProductUrl } from '~/services/marktplaats-deals/google-search'

describe('googleSearchUrl', () => {
  it('builds an English Google search URL', () => {
    expect(googleSearchUrl('2016 POKEMON XY MEWTWO-REV.FOIL EVOLUTIONS #51 cardmarket')).toBe(
      'https://www.google.com/search?q=2016%20POKEMON%20XY%20MEWTWO-REV.FOIL%20EVOLUTIONS%20%2351%20cardmarket&hl=en'
    )
  })
})

describe('firstCardmarketProductUrl', () => {
  it('returns the first Cardmarket Singles link', () => {
    const html = `
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolutions/Mewtwo-V1-EVO51">Mewtwo</a>
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolutions/Charizard-V1-EVO12">Charizard</a>
    `
    expect(firstCardmarketProductUrl(html)).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolutions/Mewtwo-V1-EVO51')
  })

  it('returns the first Singles link without slug filtering', () => {
    const html = `
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Sword-Shield-Premium-Collection/Vaporeon-VMAX-Premium-Collection">box</a>
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolving-Skies/Vaporeon-VMAX-V1-EVS030">Vaporeon</a>
    `
    expect(firstCardmarketProductUrl(html)).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles/Sword-Shield-Premium-Collection/Vaporeon-VMAX-Premium-Collection'
    )
  })

  it('normalizes non-English Cardmarket locales to /en/', () => {
    expect(firstCardmarketProductUrl('<a href="https://www.cardmarket.com/nl/Pokemon/Products/Singles/Evolutions/Mewtwo-V1-EVO51">')).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolutions/Mewtwo-V1-EVO51'
    )
  })
})

describe('pickCardmarketProductUrl', () => {
  it('prefers the English 151 listing over Chinese Collect 151 for EN hints', () => {
    const html = `
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Collect-151/Chansey-151C113">Chinese</a>
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Chansey-V1-151015">English</a>
    `
    expect(
      pickCardmarketProductUrl(html, {
        language: 'english',
        cardNumber: '015'
      })
    ).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/151/Chansey-V1-151015')
  })

  it('keeps Classic deck singles even though the set slug contains Deck', () => {
    const html = `
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Pokemon-Trading-Card-Game-Classic-Venusaur-Lugia-ex-Deck/Chansey-CLV015">Classic</a>
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Collect-151/Chansey-151C113">Chinese</a>
    `
    expect(
      pickCardmarketProductUrl(html, {
        language: 'english',
        cardNumber: '015',
        setCode: 'CLV'
      })
    ).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Pokemon-Trading-Card-Game-Classic-Venusaur-Lugia-ex-Deck/Chansey-CLV015')
  })

  it('never picks a different Pokémon just because its card number happens to match', () => {
    const html = `
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Dark-Blastoise-TR56">Dark Blastoise</a>
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Ekans-TR56b">Ekans</a>
    `
    expect(
      pickCardmarketProductUrl(html, {
        language: 'english',
        cardNumber: '56',
        pokemonName: 'Ekans'
      })
    ).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Ekans-TR56b')
  })

  it('prefers the SWSH promo single over an online-code page for premium-collection Vaporeon', () => {
    const html = `
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/Sword-Shield-Products/Online-Code-Card-Vaporeon-VMAX-Premium-Collection">code</a>
      <a href="https://www.cardmarket.com/en/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Vaporeon-VMAX-V1-SWSH182">single</a>
    `
    expect(
      pickCardmarketProductUrl(html, {
        language: 'english',
        cardNumber: '182',
        setCode: 'SWSH'
      })
    ).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Vaporeon-VMAX-V1-SWSH182')
  })
})
