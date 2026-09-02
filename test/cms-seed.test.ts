import { describe, expect, it, vi } from 'vitest'
import { seedNavItems } from '../app/cms/seed-content'
import { getProductById, getSettings, listNav, putSettings } from '../worker/cms/db'
import { CMS_SEED_VERSION, ensureSeeded, syncSeedProducts } from '../worker/cms/seed'
import { createMemoryD1 } from './helpers/memory-d1'

describe('ensureSeeded cmsSeedVersion', () => {
  it('runs legacy migration only once for an existing database', async () => {
    const db = createMemoryD1()
    await ensureSeeded(db)

    const prepare = vi.spyOn(db, 'prepare')
    prepare.mockClear()

    await ensureSeeded(db)

    const updateCalls = prepare.mock.calls.filter(([query]) => typeof query === 'string' && query.includes("REPLACE(images, '/images/', '/media/')"))
    expect(updateCalls).toHaveLength(0)
  })

  it('stores the current seed version after initial seed', async () => {
    const db = createMemoryD1()
    await ensureSeeded(db)
    const row = await db.prepare('SELECT json FROM settings WHERE id = 1').first<{ json: string }>()
    expect(JSON.parse(row!.json).cmsSeedVersion).toBe(CMS_SEED_VERSION)
  })

  it('does not duplicate nav when two requests seed an empty database concurrently', async () => {
    const db = createMemoryD1()

    const results = await Promise.allSettled([ensureSeeded(db), ensureSeeded(db)])
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)

    const nav = await listNav(db)
    expect(nav).toHaveLength(seedNavItems.length)
    expect(nav.filter((item) => item.location === 'header')).toHaveLength(4)
    expect(nav.filter((item) => item.location === 'footer')).toHaveLength(4)
  })

  it('dedupes nav items when the CMS seed version bumps to 3', async () => {
    const db = createMemoryD1()
    await ensureSeeded(db)
    await db
      .prepare("INSERT INTO nav_items (location, label, href, sort) VALUES ('header', 'Products', '/products/', 0)")
      .run()
    await db
      .prepare("INSERT INTO nav_items (location, label, href, sort) VALUES ('footer', 'Products', '/products/', 0)")
      .run()

    const settings = (await getSettings(db))!
    await putSettings(db, { ...settings, cmsSeedVersion: 2 })

    await ensureSeeded(db)

    const nav = await listNav(db)
    expect(nav).toHaveLength(seedNavItems.length)
    expect(nav.filter((item) => item.location === 'header' && item.href === '/products/')).toHaveLength(1)
    expect((await getSettings(db))?.cmsSeedVersion).toBe(CMS_SEED_VERSION)
  })

  it('syncs seed product prices when the CMS seed version bumps', async () => {
    const db = createMemoryD1()
    await ensureSeeded(db)
    await db.prepare("UPDATE products SET price = '€100' WHERE id = 1").run()
    await db.prepare("UPDATE products SET price = '€70' WHERE id = 5").run()

    const settings = (await getSettings(db))!
    await putSettings(db, { ...settings, cmsSeedVersion: 1 })

    await ensureSeeded(db)

    expect((await getProductById(db, 1))?.price).toBe('€95')
    expect((await getProductById(db, 5))?.price).toBe('€65')
    expect((await getSettings(db))?.cmsSeedVersion).toBe(CMS_SEED_VERSION)
  })
})

describe('syncSeedProducts', () => {
  it('updates existing products from seed-products.ts', async () => {
    const db = createMemoryD1()
    await ensureSeeded(db)
    await db.prepare("UPDATE products SET price = '€100' WHERE id = 1").run()

    await syncSeedProducts(db)

    expect((await getProductById(db, 1))?.price).toBe('€95')
  })
})
