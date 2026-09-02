import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatSeedProductsSource } from '../app/cms/format-seed-products'
import type { ProductRecord } from '../app/database/products'
import { rowToRecord } from '../worker/cms/db'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const remote = process.argv.includes('--remote')
const seedPath = path.join(root, 'app/cms/seed-products.ts')

type WranglerResult = {
  results?: Array<Record<string, unknown>>
  success?: boolean
}

function fetchRemoteProductRows(): Array<Record<string, unknown>> {
  const stdout = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'helloworldcards',
      '--remote',
      '--json',
      '--command',
      'SELECT * FROM products WHERE deleted_at IS NULL ORDER BY id ASC'
    ],
    { cwd: root, encoding: 'utf8' }
  )

  const parsed = JSON.parse(stdout) as WranglerResult[]
  const first = parsed[0]
  if (!first?.success || !Array.isArray(first.results)) {
    throw new Error('Failed to read remote products from D1.')
  }
  return first.results
}

async function fetchLocalProductRows(): Promise<Array<Record<string, unknown>>> {
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({
    configPath: path.join(root, 'wrangler.jsonc'),
    persist: true
  })
  const db = (proxy.env as { DB?: import('../worker/cms/db').CmsDb }).DB
  if (!db) {
    await proxy.dispose()
    throw new Error('D1 binding DB is not available.')
  }

  const { results } = await db
    .prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY id ASC')
    .all<Record<string, unknown>>()
  await proxy.dispose()
  return results
}

function asProductRows(rows: Array<Record<string, unknown>>): ProductRecord[] {
  return rows.map((row) =>
    rowToRecord({
      id: Number(row.id),
      title: String(row.title),
      subtitle: String(row.subtitle),
      description: String(row.description),
      images: String(row.images),
      pokemon_id: row.pokemon_id == null ? null : Number(row.pokemon_id),
      price: row.price == null ? null : String(row.price),
      language: row.language == null ? null : String(row.language),
      grader: row.grader == null ? null : String(row.grader),
      year: row.year == null ? null : Number(row.year),
      marktplaats_url: row.marktplaats_url == null ? null : String(row.marktplaats_url),
      slug: String(row.slug),
      cost: row.cost == null ? null : Number(row.cost),
      sold: Number(row.sold ?? 0),
      concept: Number(row.concept ?? 0),
      sold_at: row.sold_at == null ? null : String(row.sold_at),
      acquired_at: row.acquired_at == null ? null : String(row.acquired_at),
      grade: row.grade == null ? null : Number(row.grade),
      cardmarket_url: row.cardmarket_url == null ? null : String(row.cardmarket_url),
      reverse_holo: Number(row.reverse_holo ?? 0),
      first_edition: Number(row.first_edition ?? 0)
    } as Parameters<typeof rowToRecord>[0])
  )
}

const rows = remote ? fetchRemoteProductRows() : await fetchLocalProductRows()
const products = asProductRows(rows)
fs.writeFileSync(seedPath, formatSeedProductsSource(products))
console.log(`Wrote ${products.length} products from ${remote ? 'remote' : 'local'} D1 to app/cms/seed-products.ts`)
