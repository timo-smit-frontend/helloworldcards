import { describe, expect, it, vi } from 'vitest'
import { createMemoryD1 } from './helpers/memory-d1'
import { CMS_SEED_VERSION, ensureSeeded } from '../worker/cms/seed'

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
})
