import fs from 'node:fs'
import path from 'node:path'
import prettier from 'prettier'
import { describe, expect, it } from 'vitest'
import { formatSeedProductsSource } from '../app/cms/format-seed-products'
import { seedProductRecords } from '../app/cms/seed-products'
import { contentSnapshotsMatch, formatContentSnapshot, parseContentSnapshot, pullContent, pushContent } from '../worker/cms/content-sync'
import { formatMediaSnapshot, parseMediaSnapshot, pullMediaLibrary, pushMediaLibrary } from '../worker/cms/media-library-sync'
import { listFaqs, listInventory, listMedia, listPages, replaceMediaFile, trashRecord } from '../worker/cms/db'
import { readCmsState, writeCmsState } from '../vite/cms-state'
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

  /**
   * A deleted page or FAQ is simply absent from the snapshot, so the push has to notice
   * what stopped being there or a deletion never leaves the environment it was made in.
   */
  it('trashes a page the snapshot no longer carries', async () => {
    const db = await seededDb()
    const snapshot = await pullContent(db)
    await pushContent(db, { ...snapshot, pages: snapshot.pages.filter((page) => page.path !== '/privacy') })

    expect((await listPages(db)).some((page) => page.path === '/privacy')).toBe(false)
  })

  it('trashes an FAQ the snapshot no longer carries', async () => {
    const db = await seededDb()
    const snapshot = await pullContent(db)
    const dropped = snapshot.faqs[0]
    await pushContent(db, { ...snapshot, faqs: snapshot.faqs.filter((faq) => faq.id !== dropped.id) })

    expect((await listFaqs(db)).some((faq) => faq.id === dropped.id)).toBe(false)
  })

  it('leaves everything alone when a snapshot arrives empty', async () => {
    const db = await seededDb()
    const snapshot = await pullContent(db)
    await pushContent(db, { ...snapshot, pages: [], faqs: [], events: [] })

    expect((await listPages(db)).length).toBeGreaterThan(0)
  })

  /**
   * The committed snapshot is whatever the admin last pulled, so it drifts from the code
   * seed the moment content is edited. What has to keep holding is that pushing it into a
   * database leaves that database describing exactly the same content.
   */
  it('applies the committed seed/cms-content.json without losing anything', async () => {
    const snapshot = parseContentSnapshot(fs.readFileSync(path.join(process.cwd(), 'seed/cms-content.json'), 'utf8'))
    const db = await seededDb()
    await pushContent(db, snapshot)
    expect(contentSnapshotsMatch(await pullContent(db), snapshot)).toBe(true)
  })

  it('formats the committed snapshot the way a pull writes it', async () => {
    const file = path.join(process.cwd(), 'seed/cms-content.json')
    const source = fs.readFileSync(file, 'utf8')
    expect(await formatted(formatContentSnapshot(parseContentSnapshot(source)), file)).toBe(source)
  })
})

describe('whole state sync', () => {
  it('leaves a second database holding exactly the same CMS', async () => {
    const source = await seededDb()
    const target = await seededDb()

    await writeCmsState(target, await readCmsState(source))

    expect(await readCmsState(target)).toEqual(await readCmsState(source))
  })

  it('carries a deleted product across instead of leaving it behind', async () => {
    const source = await seededDb()
    const target = await seededDb()
    const dropped = (await listInventory(source))[0]
    await trashRecord(source, 'products', dropped.id)

    await writeCmsState(target, await readCmsState(source))

    expect((await listInventory(target)).some((product) => product.id === dropped.id)).toBe(false)
  })
})

describe('media library sync', () => {
  it('round-trips the library through a database', async () => {
    const source = await seededDb()
    const library = await pullMediaLibrary(source)

    const target = await seededDb()
    await pushMediaLibrary(target, library)

    expect(await pullMediaLibrary(target)).toEqual(library)
  })

  /**
   * Replacing a file gives the image a new key, so a database that only ever saw the old
   * one has to learn the new row and forget the old, or the live site keeps pointing at a
   * picture that is gone.
   */
  it('carries a replaced image to a database that still holds the old key', async () => {
    const source = await seededDb()
    const original = (await listMedia(source)).find((media) => media.key === 'wooper.png')!
    await replaceMediaFile(source, original.id, {
      key: 'abc123-wooper.png',
      filename: 'wooper.png',
      contentType: 'image/png',
      bytes: 4242
    })

    const target = await seededDb()
    await pushMediaLibrary(target, await pullMediaLibrary(source))

    const keys = (await listMedia(target)).map((media) => media.key)
    expect(keys).toContain('abc123-wooper.png')
    expect(keys).not.toContain('wooper.png')
  })

  it('never empties a library from a snapshot that has no rows', async () => {
    const db = await seededDb()
    await pushMediaLibrary(db, { media: [] })
    expect((await listMedia(db)).length).toBeGreaterThan(0)
  })

  it('parses only a real snapshot', () => {
    expect(() => parseMediaSnapshot('{"nope":true}')).toThrow()
  })

  it('formats the committed seed/cms-media.json the way a pull writes it', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'seed/cms-media.json'), 'utf8')
    expect(formatMediaSnapshot(parseMediaSnapshot(source))).toBe(source)
  })

  /**
   * Every image the content points at has to be a row in the library, because the library
   * is what tells a bucket sync which originals to carry across.
   */
  it('has a media row behind every image the seed files reference', () => {
    const keys = new Set(
      parseMediaSnapshot(fs.readFileSync(path.join(process.cwd(), 'seed/cms-media.json'), 'utf8')).media.map((entry) => entry.key)
    )
    const sources = ['seed/cms-content.json', 'app/cms/seed-products.ts'].map((file) =>
      fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    )
    const referenced = new Set(sources.flatMap((source) => [...source.matchAll(/\/media\/([\w.-]+)/g)].map((match) => match[1])))
    expect([...referenced].filter((key) => !keys.has(key))).toEqual([])
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
