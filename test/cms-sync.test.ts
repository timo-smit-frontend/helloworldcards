import fs from 'node:fs'
import path from 'node:path'
import prettier from 'prettier'
import { describe, expect, it } from 'vitest'
import { formatSeedProductsSource } from '../app/cms/format-seed-products'
import { seedProductRecords } from '../app/cms/seed-products'
import { formatContentSnapshot, parseContentSnapshot, pullContent, pushContent } from '../worker/cms/content-sync'
import { listInventory, listPages } from '../worker/cms/db'
import { ensureSeeded, syncSeedProducts } from '../worker/cms/seed'
import { inlineParams } from '../vite/cms-sync'
import { formatSeedMediaSource, readSeedMediaDir } from '../vite/seed-media-source'
import { createMemoryD1 } from './helpers/memory-d1'

/**
 * Generated seed files are written rough and normalised by Prettier before they land in
 * the repo, so a drift check has to compare what Prettier would produce.
 */
async function formatted(source: string, filepath: string): Promise<string> {
  const config = await prettier.resolveConfig(filepath)
  return prettier.format(source, { ...config, filepath })
}

async function seededDb() {
  const db = createMemoryD1()
  await ensureSeeded(db)
  return db
}

describe('cms content sync', () => {
  it('round-trips a snapshot through a database', async () => {
    const source = await seededDb()
    const snapshot = await pullContent(source)

    const target = await seededDb()
    await pushContent(target, snapshot)

    expect(await pullContent(target)).toEqual(snapshot)
  })

  it('keeps the target database its own seed version', async () => {
    const db = await seededDb()
    const snapshot = await pullContent(db)
    expect('cmsSeedVersion' in snapshot.settings).toBe(false)
  })

  it('applies an edited page to a database that has not seen it', async () => {
    const db = await seededDb()
    const snapshot = await pullContent(db)
    const edited = {
      ...snapshot,
      pages: snapshot.pages.map((page) => (page.path === '/about' ? { ...page, title: 'Over ons' } : page))
    }

    await pushContent(db, edited)

    const pages = await listPages(db)
    expect(pages.find((page) => page.path === '/about')?.title).toBe('Over ons')
  })

  it('creates a page the target does not have yet', async () => {
    const db = await seededDb()
    const snapshot = await pullContent(db)
    await pushContent(db, {
      ...snapshot,
      pages: [...snapshot.pages, { ...snapshot.pages[0], path: '/new', title: 'New' }]
    })

    expect((await listPages(db)).some((page) => page.path === '/new')).toBe(true)
  })

  it('parses only a real snapshot', () => {
    expect(() => parseContentSnapshot('{"nope":true}')).toThrow()
  })

  it('keeps seed/cms-content.json in step with app/cms/seed-content.ts', async () => {
    const db = await seededDb()
    const file = path.join(process.cwd(), 'seed/cms-content.json')
    expect(await formatted(formatContentSnapshot(await pullContent(db)), file)).toBe(fs.readFileSync(file, 'utf8'))
  })
})

describe('seed product sync', () => {
  it('updates products in place instead of duplicating them', async () => {
    const db = await seededDb()
    const before = await listInventory(db)

    await syncSeedProducts(db)
    await syncSeedProducts(db)

    const after = await listInventory(db)
    expect(after).toHaveLength(before.length)
    expect(after.map((product) => product.id)).toEqual(seedProductRecords.map((product) => product.id))
  })

  it('creates a seed product the database is missing, keeping its seed id', async () => {
    const db = await seededDb()
    const removed = seedProductRecords[0].id
    await db.prepare('DELETE FROM products WHERE id = ?').bind(removed).run()

    await syncSeedProducts(db)

    const restored = await listInventory(db)
    expect(restored.map((product) => product.id)).toContain(removed)
    expect(restored).toHaveLength(seedProductRecords.length)
  })

  it('restores a seed product that was left in the trash', async () => {
    const db = await seededDb()
    const trashed = seedProductRecords[0].id
    await db.prepare('UPDATE products SET deleted_at = ? WHERE id = ?').bind('2026-01-01T00:00:00.000Z', trashed).run()

    await syncSeedProducts(db)

    const restored = await listInventory(db)
    expect(restored.map((product) => product.id)).toContain(trashed)
    expect(restored).toHaveLength(seedProductRecords.length)
  })

  it('keeps app/cms/seed-products.ts in the shape the pull writes', async () => {
    const file = path.join(process.cwd(), 'app/cms/seed-products.ts')
    expect(await formatted(formatSeedProductsSource(seedProductRecords), file)).toBe(fs.readFileSync(file, 'utf8'))
  })
})

describe('remote statement rendering', () => {
  it('inlines bound parameters as SQL literals', () => {
    expect(inlineParams('UPDATE products SET title = ?, cost = ?, sold_at = ? WHERE id = ?', ["it's", 12.5, null, 3])).toBe(
      "UPDATE products SET title = 'it''s', cost = 12.5, sold_at = NULL WHERE id = 3"
    )
  })
})

describe('seed media library', () => {
  it('matches the files committed under seed/media', async () => {
    const files = await readSeedMediaDir(path.join(process.cwd(), 'seed/media'))
    const file = path.join(process.cwd(), 'app/cms/seed-media.ts')
    expect(await formatted(formatSeedMediaSource(files), file)).toBe(fs.readFileSync(file, 'utf8'))
  })
})
