import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { seedProductRecords } from '../app/cms/seed-products'
import { decidePart, seedFilesDirty, syncFailureMessage, type PartAction, type PartView } from '../vite/cms-auto-sync'
import {
  CMS_SEED_FILES,
  fingerprint,
  fingerprintSeedFiles,
  parseSeedFiles,
  parseSeedProductsSource,
  readCmsState,
  readSeedFiles,
  readSyncedFingerprints,
  restoreSeedFiles,
  seedFilePath,
  writeCmsState,
  writeSeedFiles,
  writeSyncedFingerprints
} from '../vite/cms-state'
import { listInventory, listPages } from '../worker/cms/db'
import { ensureSeeded } from '../worker/cms/seed'
import { createMemoryD1 } from './helpers/memory-d1'

/** Fingerprints stand in for whole rendered files; only equality matters. */
const A = 'a'
const B = 'b'
const C = 'c'

function decide(view: Partial<PartView>): PartAction {
  return decidePart({ synced: A, local: A, remote: A, file: A, fileDirty: false, ...view })
}

describe('deciding what to do with one part', () => {
  it('does nothing while every side matches what was last settled', () => {
    expect(decide({})).toBe('idle')
  })

  it('publishes a local edit', () => {
    expect(decide({ local: B })).toBe('publish')
  })

  it('publishes a local edit whose push was interrupted, whatever the file says', () => {
    // The file was written before the push and holds the edit, production never got it.
    expect(decide({ local: B, file: B, fileDirty: true })).toBe('publish')
  })

  it('adopts an edit made in the production admin', () => {
    expect(decide({ remote: B })).toBe('adopt')
  })

  it('adopts a change that another machine committed and published', () => {
    expect(decide({ remote: B, file: B })).toBe('adopt')
  })

  it('keeps the local version when both admins were used', () => {
    expect(decide({ local: B, remote: C })).toBe('overwrite')
  })

  it('settles when both sides moved to the same state', () => {
    expect(decide({ local: B, remote: B })).toBe('settle')
  })

  it('applies a file somebody edited by hand', () => {
    expect(decide({ file: B, fileDirty: true })).toBe('apply')
  })

  it('leaves a file that git checked out alone', () => {
    expect(decide({ file: B, fileDirty: false })).toBe('hold')
    expect(decide({ file: B, fileDirty: null })).toBe('hold')
  })

  it('rewrites a file that is missing', () => {
    expect(decide({ file: null })).toBe('settle')
  })

  describe('a database with no record of a last sync', () => {
    it('never wins over production', () => {
      // A fresh, wiped or copied database looks exactly like this.
      expect(decide({ synced: null, local: B })).toBe('adopt')
      expect(decide({ synced: null, local: B, file: B, fileDirty: true })).toBe('adopt')
      expect(decide({ synced: null, remote: B })).toBe('adopt')
    })

    it('records the state two agreeing databases hold', () => {
      expect(decide({ synced: null })).toBe('settle')
      expect(decide({ synced: null, file: B })).toBe('settle')
      expect(decide({ synced: null, file: null })).toBe('settle')
    })

    it('still applies a hand-edited file when the databases agree', () => {
      expect(decide({ synced: null, file: B, fileDirty: true })).toBe('apply')
    })
  })
})

describe('the local sync record', () => {
  it('is kept in the database and read back per part', async () => {
    const db = createMemoryD1()
    expect(await readSyncedFingerprints(db)).toEqual({})

    await writeSyncedFingerprints(db, { content: 'one', media: 'two' })
    expect(await readSyncedFingerprints(db)).toEqual({ content: 'one', media: 'two' })

    await writeSyncedFingerprints(db, { media: 'three' })
    expect(await readSyncedFingerprints(db)).toEqual({ content: 'one', media: 'three' })
  })

  it('fingerprints each file that exists', () => {
    const prints = fingerprintSeedFiles({ content: 'x', media: 'y' })
    expect(Object.keys(prints)).toEqual(['content', 'media'])
    expect(prints.content).toBe(fingerprint('x'))
    expect(fingerprint('x')).not.toBe(fingerprint('y'))
  })
})

describe('reading the committed files back', () => {
  it('parses app/cms/seed-products.ts to the records it was written from', async () => {
    const source = await fs.readFile(seedFilePath(process.cwd(), 'products'), 'utf8')
    expect(parseSeedProductsSource(source)).toEqual(seedProductRecords)
  })

  it('refuses a file that is not the generated array', () => {
    expect(() => parseSeedProductsSource('export const other = 1')).toThrow(/seedProductRecords/)
    expect(() => parseSeedProductsSource('export const seedProductRecords = process.exit()')).toThrow()
    expect(() => parseSeedProductsSource('export const seedProductRecords = [1]')).toThrow(/array of products/)
  })

  it('parses every committed seed file into the state it describes', async () => {
    const files = await readSeedFiles(process.cwd())
    const state = parseSeedFiles(files, ['content', 'products', 'media'])
    expect(state.content?.pages.length).toBeGreaterThan(0)
    expect(state.products).toEqual(seedProductRecords)
    expect(Array.isArray(state.media?.folders)).toBe(true)
  })
})

describe('writing part of a state', () => {
  it('touches only the parts named', async () => {
    const db = createMemoryD1()
    await ensureSeeded(db)
    const state = await readCmsState(db)
    const edited = {
      ...state,
      content: { ...state.content, pages: state.content.pages.map((page) => ({ ...page, title: `${page.title}!` })) },
      products: state.products.map((product) => ({ ...product, title: `${product.title}!` }))
    }

    await writeCmsState(db, edited, ['products'])

    expect((await listInventory(db)).every((product) => product.title.endsWith('!'))).toBe(true)
    expect((await listPages(db)).some((page) => page.title.endsWith('!'))).toBe(false)
  })
})

describe('telling a hand edit from a checkout', () => {
  it('reports the seed files that differ from git HEAD', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-git-'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    for (const file of Object.values(CMS_SEED_FILES)) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await fs.writeFile(path.join(root, file), 'committed\n')
    }
    git('add', '.')
    git('commit', '-q', '-m', 'seed')

    expect(await seedFilesDirty(root)).toEqual({ content: false, products: false, media: false })

    await fs.writeFile(seedFilePath(root, 'media'), 'edited\n')
    expect(await seedFilesDirty(root)).toEqual({ content: false, products: false, media: true })
  })

  it('cannot say outside a repository', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-nogit-'))
    // A temporary directory may sit inside some repository; only an actual failure is null.
    const result = await seedFilesDirty(path.join(root, 'missing'))
    expect(result).toBeNull()
  })
})

describe('naming a sync failure', () => {
  const crash = {
    message: 'Command failed: npx wrangler d1 execute helloworldcards --remote --json --command SELECT id, name FROM media_folders'
  }

  it('points at the migration when production is behind the schema', () => {
    const stdout = '{ "error": { "notes": [ { "text": "no such table: media_folders: SQLITE_ERROR [code: 7500]" } ] } }'
    expect(syncFailureMessage(crash, stdout, 'Error: Command failed ...\n    at genericNodeError')).toBe(
      'production database has no table media_folders yet — run `npm run migrate:remote` to apply the committed migrations, or deploy'
    )
    expect(syncFailureMessage(crash, '', '✘ [ERROR] no such column: folder_id: SQLITE_ERROR')).toContain('no column folder_id yet')
  })

  it('passes any other failure through with what the child wrote', () => {
    expect(syncFailureMessage({ message: 'Command failed: npx vite-node' }, '', 'TypeError: boom\n')).toBe(
      'Command failed: npx vite-node\nTypeError: boom'
    )
  })
})

describe('putting seed files back after a failed push', () => {
  /**
   * What is committed must never claim more than production has: the push is retried
   * from the database's own record, not from the files.
   */
  it('restores what the files held, and removes one that did not exist', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-seed-'))
    await fs.mkdir(path.join(root, 'seed'), { recursive: true })
    await fs.mkdir(path.join(root, 'app/cms'), { recursive: true })
    await fs.writeFile(seedFilePath(root, 'media'), '{ "folders": [] }\n')

    const previous = await readSeedFiles(root)
    const changed = await writeSeedFiles(root, { content: 'content', products: 'products', media: '{ "folders": ["Slabs"] }\n' })
    expect(changed).toEqual(['content', 'products', 'media'])

    await restoreSeedFiles(root, previous, changed)
    expect(await readSeedFiles(root)).toEqual({ media: '{ "folders": [] }\n' })
  })
})
