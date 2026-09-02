import type { ProductRecord } from '../database/products'

function indent(level: number): string {
  return '  '.repeat(level)
}

function formatValue(value: unknown, level: number): string {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    const items = value.map((item) => `${indent(level + 1)}${formatValue(item, level + 1)}`).join(',\n')
    return `[\n${items}\n${indent(level)}]`
  }
  throw new Error(`Unsupported seed value: ${typeof value}`)
}

const FIELD_ORDER: Array<keyof ProductRecord> = [
  'id',
  'title',
  'subtitle',
  'description',
  'images',
  'pokemonId',
  'price',
  'language',
  'grader',
  'grade',
  'year',
  'marktplaatsUrl',
  'cardmarketUrl',
  'reverseHolo',
  'firstEdition',
  'cost',
  'sold',
  'concept',
  'soldAt',
  'acquiredAt'
]

/** Serialize inventory records as `app/cms/seed-products.ts` source. */
export function formatSeedProductsSource(products: ProductRecord[]): string {
  const blocks = products.map((product) => {
    const lines: string[] = [`${indent(1)}{`]
    for (const key of FIELD_ORDER) {
      const value = product[key]
      if (value === undefined || value === false) {
        continue
      }
      lines.push(`${indent(2)}${key}: ${formatValue(value, 2)},`)
    }
    lines.push(`${indent(1)}}`)
    return lines.join('\n')
  })

  return [
    "import type { ProductRecord } from '../database/products'",
    '',
    'export const seedProductRecords: ProductRecord[] = [',
    blocks.join(',\n'),
    ']',
    ''
  ].join('\n')
}
