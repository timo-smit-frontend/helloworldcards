import { describe, expect, it } from 'vitest'
import { getAllProducts, getInventory, getProductBySlug, getRandomProducts, isShopListed, productBuyLink } from '~/database/products'

describe('product inventory', () => {
  it('keeps only the shop cards, titled as printed on the slab', () => {
    expect(getAllProducts().map((product) => [product.id, product.title, product.subtitle, product.slug])).toEqual([
      [1, 'Mewtwo', '2016 Evolutions - #51', 'mewtwo-2016-evolutions-51'],
      [2, 'Lugia V', '2022 Silver Tempest - #185', 'lugia-v-2022-silver-tempest-185'],
      [3, 'Charizard', '2016 Radiant Collection - #RC5', 'charizard-2016-radiant-collection-rc5'],
      [4, 'Ekans', '2000 Team Rocket - #56', 'ekans-2000-team-rocket-56'],
      [5, 'Zorua AR', '2025 White Flare Japanese - #140', 'zorua-ar-2025-white-flare-japanese-140'],
      [6, 'Arceus V', '2022 Brilliant Stars - #165', 'arceus-v-2022-brilliant-stars-165'],
      [7, 'Mega Latias ex', '2025 Mega Evolution - #181', 'mega-latias-ex-2025-mega-evolution-181'],
      [8, 'Zekrom', '2022 Brilliant Stars - #TG05', 'zekrom-2022-brilliant-stars-tg05'],
      [9, 'Poke Kid', '2020 Shiny Star V Japanese - #197', 'poke-kid-2020-shiny-star-v-japanese-197']
    ])
  })

  it('keeps purchase cost and sale status off the public product records', () => {
    expect(
      getAllProducts().every(
        (product) =>
          !('cost' in product) &&
          !('sold' in product) &&
          !('soldAt' in product) &&
          !('acquiredAt' in product) &&
          !('concept' in product) &&
          !('grade' in product) &&
          !('cardmarketUrl' in product) &&
          !('reverseHolo' in product) &&
          !('firstEdition' in product)
      )
    ).toBe(true)
  })

  it('keeps sold cards in inventory and off the shop', () => {
    expect(isShopListed({})).toBe(true)
    expect(isShopListed({ sold: false })).toBe(true)
    expect(isShopListed({ sold: true })).toBe(false)

    const sold = getInventory().filter((item) => item.sold)
    const shopIds = new Set(getAllProducts().map((product) => product.id))

    for (const item of sold) {
      expect(shopIds.has(item.id)).toBe(false)
      expect(getProductBySlug(item.slug)).toBeUndefined()
    }
  })

  it('marks Arceus, Latias, Zekrom, and Poke Kid as concept inventory without listing URLs', () => {
    const inventory = getInventory()
    const liveIds = [1, 2, 3, 4, 5]
    const conceptIds = [6, 7, 8, 9]

    for (const id of liveIds) {
      const item = inventory.find((product) => product.id === id)
      expect(item?.concept).toBeUndefined()
      expect(item?.marktplaatsUrl).toMatch(/^https:\/\/www\.marktplaats\.nl\//)
    }

    for (const id of conceptIds) {
      const item = inventory.find((product) => product.id === id)
      expect(item?.concept).toBe(true)
      expect(item?.marktplaatsUrl).toBeUndefined()
      expect(getAllProducts().some((product) => product.id === id)).toBe(true)
    }

    expect(inventory.every((item) => !(item.concept && item.marktplaatsUrl))).toBe(true)
  })

  it('tracks what was paid for stock on the inventory records', () => {
    const priced = getInventory().filter((product) => product.cost != null)

    expect(priced.length).toBeGreaterThan(0)
    expect(priced.every((product) => product.cost != null && product.cost >= 0)).toBe(true)
  })

  it('lists the Evolutions Mewtwo at the current shop price', () => {
    const product = getProductBySlug('mewtwo-2016-evolutions-51')

    expect(product?.title).toBe('Mewtwo')
    expect(product?.description).toContain('reverse holo')
    expect(product?.description).toContain('XY Evolutions')
    expect(product?.description).toContain('51/108')
    expect(product?.description).toContain('148651617')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.price).toBe('€100')
    expect(product?.language).toBe('english')
    expect(product?.grader).toBe('psa')
    expect(product?.year).toBe(2016)
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436737465')
    const inventory = getInventory().find((item) => item.id === 1)
    expect(inventory?.cardmarketUrl).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolutions/Mewtwo-V1-EVO51')
    expect(inventory?.reverseHolo).toBe(true)
    expect(inventory?.firstEdition).toBeUndefined()
  })

  it('lists the Silver Tempest Lugia V with slab photos', () => {
    const product = getProductBySlug('lugia-v-2022-silver-tempest-185')
    const inventory = getInventory().find((item) => item.id === 2)

    expect(product?.title).toBe('Lugia V')
    expect(product?.description).toContain('Full Art')
    expect(product?.description).toContain('Silver Tempest')
    expect(product?.description).toContain('185/195')
    expect(product?.description).toContain('76719295')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.price).toBe('€45')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436737892')
    expect(product?.images).toEqual(['/images/76719295_front.jpg', '/images/76719295_back.jpg'])
    expect(inventory?.cost).toBe(30)
    expect(inventory?.cardmarketUrl).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Silver-Tempest/Lugia-V-V2-SIT185')
  })

  it('lists the Generations Charizard with slab photos', () => {
    const product = getProductBySlug('charizard-2016-radiant-collection-rc5')
    const inventory = getInventory().find((item) => item.id === 3)

    expect(product?.title).toBe('Charizard')
    expect(product?.description).toContain('holo')
    expect(product?.description).toContain('Radiant Collection')
    expect(product?.description).toContain('RC5/RC32')
    expect(product?.description).toContain('61958598')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.price).toBe('€125')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436738233')
    expect(product?.images).toEqual(['/images/61958598_front.jpg', '/images/61958598_back.jpg'])
    expect(product?.pokemonId).toBe(6)
    expect(inventory?.cost).toBe(75)
  })

  it('lists the 1st Edition Rocket Ekans with slab photos', () => {
    const product = getProductBySlug('ekans-2000-team-rocket-56')

    expect(product?.title).toBe('Ekans')
    expect(product?.subtitle).toBe('2000 Team Rocket - #56')
    expect(product?.description).toContain('1st Edition')
    expect(product?.description).toContain('Team Rocket')
    expect(product?.description).toContain('56/82')
    expect(product?.description).toContain('76645522')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.images).toEqual(['/images/76645522_front.jpg', '/images/76645522_back.jpg'])
    expect(product?.pokemonId).toBe(23)
    expect(product?.price).toBe('€60')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436738700')
    expect(getInventory().find((item) => item.id === 4)?.cost).toBe(25)
    const inventory = getInventory().find((item) => item.id === 4)
    expect(inventory?.cardmarketUrl).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Ekans-TR56')
    expect(inventory?.firstEdition).toBe(true)
    expect(inventory?.reverseHolo).toBeUndefined()
  })

  it('lists the White Flare Japanese Zorua AR with Beckett slab photos', () => {
    const product = getProductBySlug('zorua-ar-2025-white-flare-japanese-140')
    const inventory = getInventory().find((item) => item.id === 5)

    expect(product?.title).toBe('Zorua AR')
    expect(product?.subtitle).toBe('2025 White Flare Japanese - #140')
    expect(product?.description).toContain('Art Rare')
    expect(product?.description).toContain('White Flare Japanese')
    expect(product?.description).toContain('140/086')
    expect(product?.description).toContain('BGS 9.5')
    expect(product?.description).toContain('18501427')
    expect(product?.description).toContain('centering 9.5')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.images).toEqual(['/images/18501427_front.jpg', '/images/18501427_back.jpg'])
    expect(product?.pokemonId).toBe(570)
    expect(product?.price).toBe('€70')
    expect(product?.language).toBe('japanese')
    expect(product?.grader).toBe('beckett')
    expect(product?.year).toBe(2025)
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436896724')
    expect(inventory?.cost).toBe(40)
    expect(inventory?.acquiredAt).toBe('2026-08-30')
  })

  it('lists the Brilliant Stars Arceus V with slab photos', () => {
    const product = getProductBySlug('arceus-v-2022-brilliant-stars-165')

    expect(product?.title).toBe('Arceus V')
    expect(product?.subtitle).toBe('2022 Brilliant Stars - #165')
    expect(product?.description).toContain('Full Art')
    expect(product?.description).toContain('Brilliant Stars')
    expect(product?.description).toContain('165/172')
    expect(product?.description).toContain('142991345')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.images).toEqual(['/images/142991345_front.jpg', '/images/142991345_back.jpg'])
    expect(product?.pokemonId).toBe(493)
    expect(product?.price).toBe('€50')
    expect(getInventory().find((item) => item.id === 6)?.cost).toBe(28)
    expect(getInventory().find((item) => item.id === 6)?.acquiredAt).toBe('2026-08-30')
    expect(getInventory().find((item) => item.id === 6)?.cardmarketUrl).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles/Brilliant-Stars/Arceus-V-V2-BRS165'
    )
  })

  it('lists the Mega Evolution Mega Latias ex SIR with slab photos', () => {
    const product = getProductBySlug('mega-latias-ex-2025-mega-evolution-181')

    expect(product?.title).toBe('Mega Latias ex')
    expect(product?.subtitle).toBe('2025 Mega Evolution - #181')
    expect(product?.description).toContain('Special Illustration Rare')
    expect(product?.description).toContain('Mega Evolution')
    expect(product?.description).toContain('181/132')
    expect(product?.description).toContain('136389084')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.images).toEqual(['/images/136389084_front.jpg', '/images/136389084_back.jpg'])
    expect(product?.pokemonId).toBe(380)
    expect(product?.price).toBe('€120')
    expect(getInventory().find((item) => item.id === 7)?.cost).toBe(72)
    expect(getInventory().find((item) => item.id === 7)?.acquiredAt).toBe('2026-08-30')
    expect(getInventory().find((item) => item.id === 7)?.cardmarketUrl).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles/Mega-Evolution/Mega-Latias-ex-V3-MEG181'
    )
  })

  it('lists the Brilliant Stars Trainer Gallery Zekrom with slab photos', () => {
    const product = getProductBySlug('zekrom-2022-brilliant-stars-tg05')

    expect(product?.title).toBe('Zekrom')
    expect(product?.subtitle).toBe('2022 Brilliant Stars - #TG05')
    expect(product?.description).toContain('Trainer Gallery')
    expect(product?.description).toContain('Brilliant Stars')
    expect(product?.description).toContain('TG05/TG30')
    expect(product?.description).toContain('142991337')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.images).toEqual(['/images/142991337_front.jpg', '/images/142991337_back.jpg'])
    expect(product?.pokemonId).toBe(644)
    expect(product?.price).toBe('€60')
    expect(getInventory().find((item) => item.id === 8)?.cost).toBe(28)
    expect(getInventory().find((item) => item.id === 8)?.acquiredAt).toBe('2026-08-30')
  })

  it('lists the Shiny Star V Japanese Poke Kid FA with slab photos', () => {
    const product = getProductBySlug('poke-kid-2020-shiny-star-v-japanese-197')
    const inventory = getInventory().find((item) => item.id === 9)

    expect(product?.title).toBe('Poke Kid')
    expect(product?.subtitle).toBe('2020 Shiny Star V Japanese - #197')
    expect(product?.description).toContain('Full Art')
    expect(product?.description).toContain('Shiny Star V Japanese')
    expect(product?.description).toContain('197/190')
    expect(product?.description).toContain('PSA 10')
    expect(product?.description).toContain('80573086')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.images).toEqual(['/images/80573086_front.jpg', '/images/80573086_back.jpg'])
    expect(product?.pokemonId).toBeUndefined()
    expect(product?.price).toBe('€95')
    expect(product?.language).toBe('japanese')
    expect(product?.grader).toBe('psa')
    expect(product?.year).toBe(2020)
    expect(product?.marktplaatsUrl).toBeUndefined()
    expect(inventory?.concept).toBe(true)
    expect(inventory?.grade).toBe(10)
    expect(inventory?.cardmarketUrl).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Shiny-Star-V/Poke-Kid-s4a197')
    expect(inventory?.cost).toBe(61)
    expect(inventory?.acquiredAt).toBe('2026-08-31')
  })

  it('picks a random sample of available shop cards', () => {
    const shopIds = new Set(getAllProducts().map((product) => product.id))
    const soldIds = new Set(
      getInventory()
        .filter((item) => item.sold)
        .map((item) => item.id)
    )
    const sample = getRandomProducts(4)
    const uniqueIds = new Set(sample.map((product) => product.id))

    expect(sample).toHaveLength(Math.min(4, shopIds.size))
    expect(uniqueIds.size).toBe(sample.length)
    expect(sample.every((product) => shopIds.has(product.id))).toBe(true)
    expect(sample.every((product) => !soldIds.has(product.id))).toBe(true)
    expect(sample.every((product) => !('sold' in product))).toBe(true)
    expect(sample.every((product) => !('concept' in product))).toBe(true)
  })

  it('defaults to four available products', () => {
    expect(getRandomProducts()).toHaveLength(Math.min(4, getAllProducts().length))
  })

  it('uses a Marktplaats buy link when the listing URL is set', () => {
    const product = getProductBySlug('mewtwo-2016-evolutions-51')
    expect(productBuyLink(product!)).toEqual({
      url: 'https://www.marktplaats.nl/seller/view/m2436737465',
      title: 'View on Marktplaats',
      target: '_blank'
    })
  })

  it('uses a disabled concept CTA when there is no listing URL', () => {
    const product = getProductBySlug('zekrom-2022-brilliant-stars-tg05')
    expect(product?.marktplaatsUrl).toBeUndefined()
    expect(productBuyLink(product!)).toEqual({ title: 'Not yet available to buy' })
    expect(productBuyLink(product!).url).toBeUndefined()
  })
})
