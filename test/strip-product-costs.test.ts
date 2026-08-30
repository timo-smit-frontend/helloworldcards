import { describe, expect, it } from 'vitest'
import { stripProductCosts } from '../vite/strip-product-costs'

describe('stripProductCosts', () => {
  it('removes purchase cost fields from product source', () => {
    const source = ['const products = [', '  {', "    title: 'Mewtwo',", '    cost: 55,', "    price: '€99'", '  }', ']'].join('\n')

    const stripped = stripProductCosts(`${source}\n`)

    expect(stripped).not.toMatch(/\bcost:/)
    expect(stripped).toContain("price: '€99'")
    expect(stripped).toContain("title: 'Mewtwo'")
  })

  it('leaves the public type field intact', () => {
    expect(stripProductCosts('  cost?: number\n')).toContain('cost?: number')
  })
})
