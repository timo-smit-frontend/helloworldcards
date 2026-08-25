import { describe, expect, it } from 'vitest'
import { getAllProducts, getInventory, getProductBySlug } from './products'

describe('product inventory', () => {
  it('keeps purchase cost off the public product records', () => {
    expect(getAllProducts().length).toBeGreaterThan(0)
    expect(getAllProducts().every((product) => !('cost' in product))).toBe(true)
  })

  it('tracks what was paid for stock on the inventory records', () => {
    const priced = getInventory().filter((product) => product.cost != null)

    expect(priced.length).toBeGreaterThan(0)
    expect(priced.every((product) => product.cost != null && product.cost >= 0)).toBe(true)
  })

  it('lists the Silver Tempest Lugia V with slab photos', () => {
    const product = getProductBySlug('lugia-v-full-art-2022-sword-shield-silver-tempest-185-195')
    const inventory = getInventory().find((item) => item.id === 9)

    expect(product?.title).toBe('Lugia V Full Art')
    expect(product?.price).toBe('€45')
    expect(product?.images).toEqual(['/images/76719295_front.jpg', '/images/76719295_back.jpg'])
    expect(inventory?.cost).toBe(30)
  })

  it('lists the Generations Charizard with a Pokémon placeholder', () => {
    const product = getProductBySlug('charizard-holo-2016-xy-generations-radiant-collection-rc5-rc32')
    const inventory = getInventory().find((item) => item.id === 10)

    expect(product?.title).toBe('Charizard Holo')
    expect(product?.price).toBe('€120')
    expect(product?.images).toEqual([])
    expect(product?.pokemonId).toBe(6)
    expect(inventory?.cost).toBe(75)
  })
})
