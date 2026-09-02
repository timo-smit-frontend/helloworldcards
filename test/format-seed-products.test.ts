import { describe, expect, it } from 'vitest'
import { formatSeedProductsSource } from '../app/cms/format-seed-products'
import type { ProductRecord } from '../app/database/products'

describe('formatSeedProductsSource', () => {
  it('writes a seed module with optional fields omitted when falsey', () => {
    const products: ProductRecord[] = [
      {
        id: 1,
        title: 'Mewtwo',
        subtitle: '2016 Evolutions - #51',
        description: 'A reverse holo.',
        images: ['/media/front.jpg'],
        price: '€95',
        language: 'english',
        grader: 'psa',
        grade: 9,
        year: 2016,
        cost: 55,
        reverseHolo: true
      }
    ]

    const source = formatSeedProductsSource(products)
    expect(source).toContain("price: \"€95\"")
    expect(source).toContain('reverseHolo: true')
    expect(source).not.toContain('sold:')
    expect(source).not.toContain('concept:')
    expect(source).toContain('export const seedProductRecords')
  })
})
