import { describe, expect, it } from 'vitest'
import { getAllProducts, getInventory, getProductBySlug, isShopListed } from './products'

describe('product inventory', () => {
  it('keeps only the four shop cards, titled as printed on the slab', () => {
    expect(
      getAllProducts().map((product) => [product.id, product.title, product.subtitle, product.slug])
    ).toEqual([
      [1, 'Mewtwo', '2016 Evolutions - #51', 'mewtwo-2016-evolutions-51'],
      [2, 'Lugia V', '2022 Silver Tempest - #185', 'lugia-v-2022-silver-tempest-185'],
      [3, 'Charizard', '2016 Radiant Collection - #RC5', 'charizard-2016-radiant-collection-rc5'],
      [4, 'Ekans', '2000 Team Rocket - #56', 'ekans-2000-team-rocket-56']
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
    expect(product?.price).toBe('€100')
  })

  it('lists the Silver Tempest Lugia V with slab photos', () => {
    const product = getProductBySlug('lugia-v-2022-silver-tempest-185')
    const inventory = getInventory().find((item) => item.id === 2)

    expect(product?.title).toBe('Lugia V')
    expect(product?.description).toContain('Silver Tempest')
    expect(product?.description).toContain('185/195')
    expect(product?.price).toBe('€45')
    expect(product?.images).toEqual(['/images/76719295_front.jpg', '/images/76719295_back.jpg'])
    expect(inventory?.cost).toBe(30)
  })

  it('lists the Generations Charizard with slab photos', () => {
    const product = getProductBySlug('charizard-2016-radiant-collection-rc5')
    const inventory = getInventory().find((item) => item.id === 3)

    expect(product?.title).toBe('Charizard')
    expect(product?.description).toContain('Radiant Collection')
    expect(product?.description).toContain('RC5/RC32')
    expect(product?.price).toBe('€125')
    expect(product?.images).toEqual(['/images/61958598_front.jpg', '/images/61958598_back.jpg'])
    expect(product?.pokemonId).toBe(6)
    expect(inventory?.cost).toBe(75)
  })

  it('lists the 1st Edition Rocket Ekans with slab photos', () => {
    const product = getProductBySlug('ekans-2000-team-rocket-56')

    expect(product?.title).toBe('Ekans')
    expect(product?.subtitle).toBe('2000 Team Rocket - #56')
    expect(product?.description).toContain('56/82')
    expect(product?.images).toEqual(['/images/76645522_front.jpg', '/images/76645522_back.jpg'])
    expect(product?.pokemonId).toBe(23)
    expect(product?.price).toBe('€60')
    expect(getInventory().find((item) => item.id === 4)?.cost).toBe(25)
  })
})
