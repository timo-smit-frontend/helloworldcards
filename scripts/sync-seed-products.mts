import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedProductWithSlug } from '../app/cms/seed-content'
import { seedProductRecords } from '../app/cms/seed-products'
import { productWriteValues } from '../worker/cms/db'
import { ensureCmsSchema } from '../test/helpers/memory-d1'
import { ensureSeeded, syncSeedProducts } from '../worker/cms/seed'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const remote = process.argv.includes('--remote')

function sqlLiteral(value: unknown): string {
  if (value == null) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

function syncRemoteWithWrangler(): void {
  const columns = [
    'title',
    'subtitle',
    'description',
    'images',
    'pokemon_id',
    'price',
    'language',
    'grader',
    'year',
    'marktplaats_url',
    'vinted_url',
    'slug',
    'cost',
    'sold',
    'concept',
    'sold_at',
    'acquired_at',
    'grade',
    'cardmarket_url',
    'reverse_holo',
    'first_edition'
  ]

  const statements = seedProductRecords.map((product) => {
    const seeded = seedProductWithSlug(product)
    const values = productWriteValues(seeded)
    const assignments = columns.map((column, index) => `${column} = ${sqlLiteral(values[index])}`).join(', ')
    return `UPDATE products SET ${assignments} WHERE id = ${product.id}`
  })

  execFileSync('npx', ['wrangler', 'd1', 'execute', 'helloworldcards', '--remote', '--command', statements.join('; ')], {
    cwd: root,
    stdio: 'inherit'
  })
}

if (remote) {
  syncRemoteWithWrangler()
  console.log('Synced remote CMS products from app/cms/seed-products.ts')
} else {
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({
    configPath: path.join(root, 'wrangler.jsonc'),
    persist: true
  })

  const db = (proxy.env as { DB?: import('../worker/cms/db').CmsDb }).DB
  if (!db) {
    throw new Error('D1 binding DB is not available.')
  }

  await ensureCmsSchema(db)
  await ensureSeeded(db)
  await syncSeedProducts(db)
  await proxy.dispose()

  console.log('Synced local CMS products from app/cms/seed-products.ts')
}
