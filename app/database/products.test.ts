import { describe, expect, it } from 'vitest'
import { getAllProducts, getInventory } from './products'

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
})
