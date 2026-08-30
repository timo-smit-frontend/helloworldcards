import { describe, expect, it } from 'vitest'
import { getAllProducts, getInventory, getProductBySlug, getRandomProducts, isShopListed } from '~/database/products'

describe('product inventory', () => {
  it('keeps only the shop cards, titled as printed on the slab', () => {
    expect(getAllProducts().map((product) => [product.id, product.title, product.subtitle, product.slug])).toEqual([
      [1, 'Mewtwo', '2016 Evolutions - #51', 'mewtwo-2016-evolutions-51'],
      [2, 'Lugia V', '2022 Silver Tempest - #185', 'lugia-v-2022-silver-tempest-185'],
      [3, 'Charizard', '2016 Radiant Collection - #RC5', 'charizard-2016-radiant-collection-rc5'],
      [4, 'Ekans', '2000 Team Rocket - #56', 'ekans-2000-team-rocket-56'],
      [5, 'Zorua AR', '2025 White Flare Japanese - #140', 'zorua-ar-2025-white-flare-japanese-140']
    ])
  })

  it('keeps purchase cost and sale status off the public product records', () => {
    expect(
      getAllProducts().every(
        (product) => !('cost' in product) && !('sold' in product) && !('soldAt' in product) && !('acquiredAt' in product)
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
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436737465')
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
    expect(product?.images).toEqual(['/images/0018501427_front.jpg', '/images/0018501427_back.jpg'])
    expect(product?.pokemonId).toBe(570)
    expect(product?.price).toBe('€70')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436896724')
    expect(inventory?.cost).toBe(40)
    expect(inventory?.acquiredAt).toBe('2026-08-30')
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
  })

  it('defaults to four available products', () => {
    expect(getRandomProducts()).toHaveLength(Math.min(4, getAllProducts().length))
  })
})
