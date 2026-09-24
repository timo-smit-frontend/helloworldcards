import { describe, expect, it } from 'vitest'
import { pullContent, pushContent } from '../worker/cms/content-sync'
import { batchAll, listNav } from '../worker/cms/db'
import { ensureSeeded } from '../worker/cms/seed'
import { readCmsState, writeCmsState } from '../vite/cms-state'
import { remoteCmsDb, type RemoteTransport } from '../vite/cms-sync'
import { createMemoryD1 } from './helpers/memory-d1'

/**
 * Production as the sync sees it: a database reached only through Wrangler calls. Each
 * call here is one Wrangler process and one round trip in real life, so the calls are
 * counted.
 */
async function production() {
  const db = createMemoryD1()
  await ensureSeeded(db)
  const calls = { reads: [] as string[][], writes: [] as string[][] }
  const transport: RemoteTransport = {
    async read(statements) {
      calls.reads.push(statements)
      return Promise.all(statements.map(async (sql) => (await db.prepare(sql).all()).results))
    },
    async write(statements) {
      calls.writes.push(statements)
      await db.exec(`BEGIN;\n${statements.join(';\n')};\nCOMMIT;`)
    }
  }
  return { db, calls, remote: remoteCmsDb(transport) }
}

describe('remote database', () => {
  it('reads the whole CMS state in one round trip', async () => {
    const { db, calls, remote } = await production()

    expect(await readCmsState(remote)).toEqual(await readCmsState(db))
    expect(calls.reads).toHaveLength(1)
    expect(calls.writes).toHaveLength(0)
  })

  it('sends a content push, navigation included, as one write when it is flushed', async () => {
    const { db, calls, remote } = await production()
    const snapshot = await pullContent(db)
    const added = { location: 'footer' as const, label: 'Nieuw', href: '/nieuw', sort: 99 }

    await pushContent(remote, { ...snapshot, nav: [...snapshot.nav, added] })
    expect(calls.writes).toHaveLength(0)
    expect((await listNav(db)).map((item) => item.label)).not.toContain('Nieuw')

    await remote.flush()
    expect(calls.writes).toHaveLength(1)
    const nav = (await pullContent(db)).nav
    expect(nav).toHaveLength(snapshot.nav.length + 1)
    expect(nav).toContainEqual(added)
  })

  it('never writes to production on a dry run, which does not flush', async () => {
    const { db, calls, remote } = await production()
    const before = await readCmsState(db)
    const edited = { ...before.content, nav: before.content.nav.slice(1) }

    await pushContent(remote, edited)
    await writeCmsState(remote, { ...before, content: edited })

    expect(remote.pending()).toBeGreaterThan(0)
    expect(calls.writes).toHaveLength(0)
    expect(await readCmsState(db)).toEqual(before)
  })

  it('queues the writes of a batch that writes, and reads nothing back before the flush', async () => {
    const { calls, remote } = await production()

    const [write, read] = await batchAll(remote, [
      remote.prepare('UPDATE faqs SET question = ? WHERE id = ?').bind('Nieuw?', 1),
      remote.prepare('SELECT question FROM faqs WHERE id = ?').bind(1)
    ])

    expect(write.meta?.changes).toBe(1)
    expect(read.results).toEqual([])
    expect(remote.pending()).toBe(1)
    expect(calls.reads).toHaveLength(0)
  })

  it('reads through first() and all() with their parameters inlined', async () => {
    const { remote } = await production()

    const settings = await remote.prepare('SELECT id FROM settings WHERE id = ?').bind(1).first<{ id: number }>()
    const { results } = await remote.prepare('SELECT id FROM faqs WHERE id = ?').bind(-1).all()

    expect(settings).toEqual({ id: 1 })
    expect(results).toEqual([])
  })
})
