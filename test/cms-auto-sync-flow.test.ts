import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCmsAutoSync, type CmsAutoSync } from '../vite/cms-auto-sync'
import {
  CMS_SEED_PARTS,
  fingerprintSeedFiles,
  parseSeedFiles,
  readCmsState,
  readSeedFiles,
  readSyncedFingerprints,
  renderCmsState,
  seedFilePath,
  writeCmsState,
  writeSeedFiles,
  type CmsSeedPart
} from '../vite/cms-state'
import { getProductById, listFaqs, listInventory, listMedia, listMediaFolders, updateProduct, upsertFaqWithId } from '../worker/cms/db'
import { parseMediaSnapshot, pushMediaLibrary } from '../worker/cms/media-library-sync'
import { memoryR2 } from '../worker/cms/media'
import { ensureSeeded } from '../worker/cms/seed'
import { PIKACHU_FULL, withFullPhotos } from './helpers/full-photos'
import { createMemoryD1 } from './helpers/memory-d1'

/**
 * The whole sync against two in-memory databases: the local one the sync is given, and a
 * "production" one behind a stand-in for the child process. A pull dumps production's
 * state; a push applies the seed files on disk to it, the way the real script does.
 */
async function harness(options: { readOriginal?: (key: string) => Promise<Buffer | null> } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-flow-'))
  await fs.mkdir(path.join(root, 'seed'), { recursive: true })
  await fs.mkdir(path.join(root, 'app/cms'), { recursive: true })
  // The same Prettier settings as the repo, so the files look the way they do in git.
  await fs.writeFile(
    path.join(root, '.prettierrc'),
    JSON.stringify({ semi: false, singleQuote: true, printWidth: 140, trailingComma: 'none' })
  )

  const db = createMemoryD1()
  await ensureSeeded(db)
  const production = createMemoryD1()
  await ensureSeeded(production)

  const pushes: string[][] = []
  let pulls = 0
  let failPush: Error | null = null
  let offline = false
  let dirty: Partial<Record<CmsSeedPart, boolean>> | null = { content: false, products: false, media: false }

  const media = memoryR2()
  const sync: CmsAutoSync = createCmsAutoSync({
    root,
    db,
    media,
    // The seed inventory has a sold card whose photos have not been cut down yet. Without
    // an original to read, the sync leaves it alone — and never asks production for one.
    readOriginal: options.readOriginal ?? (async () => null),
    async runSync(_root, args) {
      if (offline) {
        throw new Error('getaddrinfo ENOTFOUND api.cloudflare.com')
      }
      if (args.includes('--pull')) {
        pulls += 1
        await fs.writeFile(args[args.indexOf('--dump') + 1], JSON.stringify(await readCmsState(production)))
        return
      }
      pushes.push(args)
      if (failPush) {
        throw failPush
      }
      const parts = CMS_SEED_PARTS.filter((part) => args.includes(`--${part}`))
      const state = { ...(await readCmsState(production)), ...parseSeedFiles(await readSeedFiles(root), parts) }
      await writeCmsState(production, state, parts)
    },
    fileStatus: async () => dirty
  })

  const remoteFiles = async () => fingerprintSeedFiles(await renderCmsState(root, await readCmsState(production)))
  const localFiles = async () => fingerprintSeedFiles(await renderCmsState(root, await readCmsState(db)))
  const diskFiles = async () => fingerprintSeedFiles(await readSeedFiles(root))

  /** Bring the files and the record in line, as a first run on a settled setup does. */
  async function settled() {
    await writeSeedFiles(root, await renderCmsState(root, await readCmsState(db)))
    sync.start()
    await sync.idle()
    expect(pushes).toEqual([])
    expect(await readSyncedFingerprints(db)).toEqual(await diskFiles())
  }

  async function reconcile() {
    sync.start()
    await sync.idle()
  }

  return {
    root,
    db,
    media,
    production,
    sync,
    pushes,
    pulls: () => pulls,
    settled,
    reconcile,
    remoteFiles,
    localFiles,
    diskFiles,
    setDirty: (next: typeof dirty) => {
      dirty = next
    },
    setPushFailure: (error: Error | null) => {
      failPush = error
    },
    setOffline: (next: boolean) => {
      offline = next
    }
  }
}

async function renameProduct(db: ReturnType<typeof createMemoryD1>, id: number, title: string) {
  const product = (await getProductById(db, id))!
  await updateProduct(db, id, { ...product, title })
}

describe('the sync as a whole', () => {
  const spies: Array<ReturnType<typeof vi.spyOn>> = []
  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore()
    }
    spies.length = 0
    vi.useRealTimers()
  })
  const quiet = () => {
    spies.push(
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    )
  }

  it('records what a settled setup holds and sends nothing', async () => {
    quiet()
    const h = await harness()
    await h.settled()
    expect(await h.localFiles()).toEqual(await h.remoteFiles())
  })

  it('publishes a local edit, and only the part that changed', async () => {
    quiet()
    const h = await harness()
    await h.settled()

    await renameProduct(h.db, 1, 'Renamed locally')
    await h.reconcile()

    expect(h.pushes).toEqual([['--remote', '--products']])
    expect((await getProductById(h.production, 1))!.title).toBe('Renamed locally')
    expect(await h.diskFiles()).toEqual(await h.localFiles())
    expect(await readSyncedFingerprints(h.db)).toEqual(await h.localFiles())
  })

  it('keeps a local edit through a failed push and sends it once production can take it', async () => {
    quiet()
    const h = await harness()
    await h.settled()
    const before = await h.diskFiles()

    await renameProduct(h.db, 1, 'Made while production was behind')
    h.setPushFailure(new Error('no such table: media_folders'))
    await h.reconcile()

    // The files and the record still say what production has, so nothing is "adopted".
    expect(h.pushes).toHaveLength(1)
    expect(await h.diskFiles()).toEqual(before)
    expect(await readSyncedFingerprints(h.db)).toEqual(before)
    expect((await getProductById(h.db, 1))!.title).toBe('Made while production was behind')

    h.setPushFailure(null)
    await h.reconcile()
    expect(h.pushes).toHaveLength(2)
    expect((await getProductById(h.production, 1))!.title).toBe('Made while production was behind')
    expect((await getProductById(h.db, 1))!.title).toBe('Made while production was behind')
  })

  it('keeps an edit made while production was unreachable and publishes it later', async () => {
    quiet()
    const h = await harness()
    // The files match this database, as they do after a commit; nothing has settled yet.
    await writeSeedFiles(h.root, await renderCmsState(h.root, await readCmsState(h.db)))
    h.setOffline(true)
    await h.reconcile()
    expect(await readSyncedFingerprints(h.db)).toEqual(await h.diskFiles())

    await renameProduct(h.db, 1, 'Edited on the train')
    await h.reconcile()
    expect(h.pushes).toEqual([])

    h.setOffline(false)
    await h.reconcile()
    expect(h.pushes).toEqual([['--remote', '--products']])
    expect((await getProductById(h.production, 1))!.title).toBe('Edited on the train')
    expect((await getProductById(h.db, 1))!.title).toBe('Edited on the train')
  })

  it('says when it last settled, and settles on request before something acts on the inventory', async () => {
    quiet()
    const h = await harness()
    expect(h.sync.status()).toEqual({ settledAt: null, error: null })
    await h.settled()
    const first = h.sync.status()
    expect(first.error).toBeNull()
    expect(first.settledAt).not.toBeNull()

    // A card reserved in the production admin is in the local database once settled.
    await renameProduct(h.production, 2, 'Reserved in production')
    await h.sync.settle()
    expect((await getProductById(h.db, 2))!.title).toBe('Reserved in production')
    expect(h.sync.status().settledAt! >= first.settledAt!).toBe(true)
  })

  it('lets everyone who asks to settle during one round trip share the next one', async () => {
    quiet()
    const h = await harness()
    await h.settled()
    const before = h.pulls()

    // Three relists ask while a settle is under way: it may have read production
    // before they asked, so they wait for it and share one more — which reads
    // production after all of them asked.
    const first = h.sync.settle()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.all([first, h.sync.settle(), h.sync.settle(), h.sync.settle()])
    expect(h.pulls() - before).toBe(2)

    // Asked again later, on a quiet queue: a round trip of its own.
    await h.sync.settle()
    expect(h.pulls() - before).toBe(3)
  })

  it('fails a requested settle the way the round trip did, and shows the failure until one succeeds', async () => {
    quiet()
    spies.push(vi.spyOn(console, 'error').mockImplementation(() => {}))
    const h = await harness()
    await h.settled()

    h.setOffline(true)
    await expect(h.sync.settle()).rejects.toThrow('getaddrinfo ENOTFOUND api.cloudflare.com')
    const failed = h.sync.status()
    expect(failed.error?.message).toBe('getaddrinfo ENOTFOUND api.cloudflare.com')
    expect(failed.settledAt).not.toBeNull()

    // The queue keeps going after a failure: the next poll finds production again.
    h.setOffline(false)
    await h.reconcile()
    expect(h.sync.status().error).toBeNull()
    expect(h.sync.status().settledAt! >= failed.settledAt!).toBe(true)
  })

  it('takes an edit made in the production admin', async () => {
    quiet()
    const h = await harness()
    await h.settled()

    await renameProduct(h.production, 2, 'Renamed in production')
    await h.reconcile()

    expect(h.pushes).toEqual([])
    expect((await getProductById(h.db, 2))!.title).toBe('Renamed in production')
    expect(await h.diskFiles()).toEqual(await h.remoteFiles())
    expect(await readSyncedFingerprints(h.db)).toEqual(await h.remoteFiles())
  })

  it('merges edits made on both sides to different parts', async () => {
    quiet()
    const h = await harness()
    await h.settled()

    await renameProduct(h.db, 1, 'Local product edit')
    await upsertFaqWithId(h.production, 999, { question: 'Added in production?', answer: 'Yes.' })
    await h.reconcile()

    expect(h.pushes).toEqual([['--remote', '--products']])
    expect((await getProductById(h.production, 1))!.title).toBe('Local product edit')
    expect((await listFaqs(h.db)).some((faq) => faq.id === 999)).toBe(true)
    expect(await h.localFiles()).toEqual(await h.remoteFiles())
    expect(await readSyncedFingerprints(h.db)).toEqual(await h.localFiles())
  })

  it('lets the local version win when both admins edited the same part, once', async () => {
    quiet()
    const h = await harness()
    await h.settled()

    await renameProduct(h.db, 1, 'Local wins')
    await renameProduct(h.production, 1, 'Production loses')
    await h.reconcile()

    expect(h.pushes).toEqual([['--remote', '--products']])
    expect((await getProductById(h.production, 1))!.title).toBe('Local wins')
    expect(await h.localFiles()).toEqual(await h.remoteFiles())
  })

  it('applies a seed file somebody edited by hand to both databases', async () => {
    quiet()
    const h = await harness()
    await h.settled()

    const file = seedFilePath(h.root, 'products')
    const source = await fs.readFile(file, 'utf8')
    await fs.writeFile(file, source.replace("title: 'Mewtwo'", "title:   'Mewtwo edited by hand'"))
    h.setDirty({ content: false, products: true, media: false })
    await h.reconcile()

    expect(h.pushes).toEqual([['--remote', '--products']])
    expect((await getProductById(h.db, 1))!.title).toBe('Mewtwo edited by hand')
    expect((await getProductById(h.production, 1))!.title).toBe('Mewtwo edited by hand')
    // The file is left the way a pull writes it, so it is not seen as edited again.
    expect(await fs.readFile(file, 'utf8')).toContain("title: 'Mewtwo edited by hand'")
    expect(await h.diskFiles()).toEqual(await h.localFiles())
    expect(await readSyncedFingerprints(h.db)).toEqual(await h.localFiles())
  })

  it('leaves a seed file that git checked out alone', async () => {
    quiet()
    const h = await harness()
    await h.settled()
    const record = await readSyncedFingerprints(h.db)

    const file = seedFilePath(h.root, 'products')
    const source = await fs.readFile(file, 'utf8')
    const checkedOut = source.replace("title: 'Mewtwo'", "title: 'Mewtwo from another branch'")
    await fs.writeFile(file, checkedOut)
    await h.reconcile()

    expect(h.pushes).toEqual([])
    expect(await fs.readFile(file, 'utf8')).toBe(checkedOut)
    expect((await getProductById(h.db, 1))!.title).toBe('Mewtwo')
    expect((await getProductById(h.production, 1))!.title).toBe('Mewtwo')
    expect(await readSyncedFingerprints(h.db)).toEqual(record)
  })

  it('never publishes a database that has no record of a last sync', async () => {
    quiet()
    const h = await harness()
    // Production and the committed files moved on together; this database is a fresh seed.
    await renameProduct(h.production, 1, 'The live title')
    await writeSeedFiles(h.root, await renderCmsState(h.root, await readCmsState(h.production)))

    await h.reconcile()

    expect(h.pushes).toEqual([])
    expect((await getProductById(h.db, 1))!.title).toBe('The live title')
    expect((await listInventory(h.db)).length).toBe((await listInventory(h.production)).length)
    expect(await readSyncedFingerprints(h.db)).toEqual(await h.remoteFiles())
  })

  it('publishes shortly after an admin write', async () => {
    quiet()
    const h = await harness()
    await h.settled()

    vi.useFakeTimers()
    await renameProduct(h.db, 3, 'Typed in the local admin')
    h.sync.noteWrite()
    await vi.advanceTimersByTimeAsync(1500)
    await h.sync.idle()

    expect(h.pushes).toEqual([['--remote', '--products']])
    expect((await getProductById(h.production, 3))!.title).toBe('Typed in the local admin')
  })

  it('applies a hand edit shortly after the file changes on disk', async () => {
    quiet()
    const h = await harness()
    await h.settled()

    vi.useFakeTimers()
    const file = seedFilePath(h.root, 'content')
    const content = JSON.parse(await fs.readFile(file, 'utf8'))
    content.faqs.push({ id: 998, question: 'Added on disk?', answer: 'Yes.' })
    await fs.writeFile(file, `${JSON.stringify(content, null, 2)}\n`)
    h.setDirty({ content: true, products: false, media: false })
    h.sync.noteFileChange()
    await vi.advanceTimersByTimeAsync(1500)
    await h.sync.idle()

    expect(h.pushes).toEqual([['--remote', '--content']])
    expect((await listFaqs(h.db)).some((faq) => faq.id === 998)).toBe(true)
    expect((await listFaqs(h.production)).some((faq) => faq.id === 998)).toBe(true)
  })

  it('does not round-trip for a file change it made itself', async () => {
    quiet()
    const h = await harness()
    await h.settled()

    vi.useFakeTimers()
    h.sync.noteFileChange()
    await vi.advanceTimersByTimeAsync(1500)
    await h.sync.idle()
    expect(h.pushes).toEqual([])
  })

  describe('the photos of a sold card', () => {
    const FRONT = 'mu00djsz-122301454-front.jpg'
    const BACK = 'mu00dp1r-122301454-back.jpg'
    const KEPT = 'mu00djsz-122301454-front-sold.webp'

    /**
     * Both databases hold the whole committed media library, the way the real ones do,
     * and agree that the sold Pikachu still carries both full-size slab photos.
     */
    async function withLibrary(h: Awaited<ReturnType<typeof harness>>) {
      const library = parseMediaSnapshot(await fs.readFile(path.join(process.cwd(), 'seed/cms-media.json'), 'utf8'))
      for (const db of [h.db, h.production]) {
        await pushMediaLibrary(db, library)
        await withFullPhotos(db, PIKACHU_FULL)
      }
    }

    it('are cut down to one small photo once the sale has settled, and that is published', async () => {
      quiet()
      const original = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#a63' } })
        .jpeg()
        .toBuffer()
      const h = await harness({ readOriginal: async (key) => (key === FRONT ? original : null) })
      await withLibrary(h)
      await writeSeedFiles(h.root, await renderCmsState(h.root, await readCmsState(h.db)))

      await h.reconcile()

      expect(h.pushes).toEqual([['--remote', '--products', '--media']])
      for (const db of [h.db, h.production]) {
        expect((await getProductById(db, 14))!.images).toEqual([`/media/${KEPT}`])
        const library = await listMedia(db)
        const kept = library.find((item) => item.key === KEPT)!
        expect(kept).toMatchObject({ title: 'Pikachu, front', width: 400, height: 600 })
        expect((await listMediaFolders(db)).find((folder) => folder.id === kept.folderId)?.name).toBe('Sold')
        expect(library.some((item) => item.key === FRONT || item.key === BACK)).toBe(false)
      }
      expect(await h.media.head!(KEPT)).not.toBeNull()
      expect(await h.diskFiles()).toEqual(await h.localFiles())
      expect(await readSyncedFingerprints(h.db)).toEqual(await h.localFiles())

      // Settled: the next look round has nothing left to do.
      await h.reconcile()
      expect(h.pushes).toHaveLength(1)
    })

    it('are left alone, without a word to production, when no original can be read', async () => {
      quiet()
      const h = await harness()
      await withLibrary(h)
      await h.settled()

      expect((await getProductById(h.db, 14))!.images).toEqual([`/media/${FRONT}`, `/media/${BACK}`])
      expect((await listMedia(h.db)).some((item) => item.key === FRONT)).toBe(true)
    })

    it('follow a sale recorded in the production admin', async () => {
      quiet()
      const original = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#36a' } })
        .png()
        .toBuffer()
      const h = await harness({ readOriginal: async (key) => (key === '148651617_front.jpg' ? original : null) })
      await withLibrary(h)
      await h.settled()

      const mewtwo = (await getProductById(h.production, 1))!
      await updateProduct(h.production, 1, { ...mewtwo, sold: true, soldAt: '2026-09-21', marktplaatsUrl: undefined, vintedUrl: undefined })
      await h.reconcile()

      expect(h.pushes).toEqual([['--remote', '--products', '--media']])
      for (const db of [h.db, h.production]) {
        const product = (await getProductById(db, 1))!
        expect(product.images).toEqual(['/media/148651617_front-sold.webp'])
        expect(product).toMatchObject({ sold: true, soldAt: '2026-09-21', cost: 55, price: '€75' })
        expect((await listMedia(db)).some((item) => item.key === '148651617_front.jpg' || item.key === '148651617_back.jpg')).toBe(false)
      }
      expect(await h.diskFiles()).toEqual(await h.localFiles())
      expect(await h.localFiles()).toEqual(await h.remoteFiles())
    })
  })
})
