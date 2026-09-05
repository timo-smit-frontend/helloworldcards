import fs from 'node:fs/promises'
import path from 'node:path'
import prettier from 'prettier'
import { fileURLToPath } from 'node:url'
import { parseContentSnapshot, pushContent } from '../worker/cms/content-sync'
import { parseMediaSnapshot, pushMediaLibrary } from '../worker/cms/media-library-sync'
import { trashRowsMissingFrom, type CmsDb } from '../worker/cms/db'
import { ensureSeeded } from '../worker/cms/seed'
import { ensureCmsSchema } from '../test/helpers/memory-d1'
import { formatGeneratedFile, openLocalCms, pushSeedProducts, remoteCmsDb, type LocalCms, type RemoteCmsDb } from '../vite/cms-sync'
import { readCmsState, renderCmsState, seedFilePath, writeSeedFiles, type CmsSeedPart } from '../vite/cms-state'
import { bucketMediaSource, publicMediaSource, syncLocalMedia, syncRemoteMedia, type MediaSourceReader } from '../vite/media-sync'
import { cachedMediaSource, firstMediaSource } from '../vite/media-originals'
import { formatSeedMediaSource, readSeedMediaDir } from '../vite/seed-media-source'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const args = new Set(argv)

/** Where to write the state a pull read, for a caller that wants it without the files. */
function flagValue(name: string): string | undefined {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

const remote = args.has('--remote')
const direction = args.has('--pull') ? 'pull' : 'push'
const dryRun = args.has('--dry-run')
const dumpPath = flagValue('--dump')
const only = ['content', 'products', 'media'].filter((part) => args.has(`--${part}`))
const parts = new Set<CmsSeedPart>((only.length > 0 ? only : ['content', 'products', 'media']) as CmsSeedPart[])

const seedMediaPath = path.join(root, 'app/cms/seed-media.ts')
const where = remote ? 'remote' : 'local'

/** Regenerate the seed media library from disk so a new or replaced file is never missed. */
async function refreshSeedMediaSource(): Promise<void> {
  const files = await readSeedMediaDir(path.join(root, 'seed/media'))
  // Compare against what actually lands on disk, which is the Prettier-formatted source.
  const next = await prettier.format(formatSeedMediaSource(files), {
    ...(await prettier.resolveConfig(seedMediaPath)),
    filepath: seedMediaPath
  })
  const current = await fs.readFile(seedMediaPath, 'utf8').catch(() => '')
  if (current === next) {
    return
  }
  if (dryRun) {
    console.log(`cms-sync: app/cms/seed-media.ts is out of date (${files.length} files in seed/media)`)
    return
  }
  await fs.writeFile(seedMediaPath, next)
  formatGeneratedFile(seedMediaPath)
  console.log(`cms-sync: regenerated app/cms/seed-media.ts (${files.length} files)`)
}

/**
 * An image uploaded through an admin has no file in the repo, so its original is read
 * from the on-disk cache the dev server keeps. Opening the local Wrangler state is only a
 * last resort, because the dev server holds it while it is running.
 */
let fallbackCms: LocalCms | null = null
let fallbackOpened = false

const localBucketSource: MediaSourceReader = async (key) => {
  if (!fallbackOpened) {
    fallbackOpened = true
    try {
      fallbackCms = await openLocalCms(root)
    } catch (error) {
      console.log(`cms-sync: cannot read the local media bucket (${(error as Error).message})`)
    }
  }
  return fallbackCms ? bucketMediaSource(fallbackCms.media)(key) : null
}

async function run(): Promise<void> {
  await refreshSeedMediaSource()

  const local = remote ? null : await openLocalCms(root)
  const db: CmsDb = remote ? remoteCmsDb() : local!.db

  try {
    if (local) {
      // Local D1 is created on demand, so make sure it has the schema and a first seed
      // before anything tries to read or write it.
      await ensureCmsSchema(local.db, root)
      await ensureSeeded(local.db)
    }

    if (direction === 'pull') {
      const state = await readCmsState(db)
      if (dumpPath) {
        await fs.writeFile(dumpPath, JSON.stringify(state))
      }
      const rendered = await renderCmsState(root, state)
      const changed = dryRun ? [] : await writeSeedFiles(root, rendered, [...parts])
      console.log(
        `cms-sync: pulled ${state.content.pages.length} pages, ${state.content.faqs.length} FAQs, ${state.content.events.length} events, ${state.content.nav.length} nav items, ${state.products.length} products and ${state.media.media.length} media rows from ${where}`
      )
      if (!dryRun) {
        console.log(changed.length > 0 ? `cms-sync: updated ${changed.join(', ')}` : 'cms-sync: seed files were already up to date')
      }
      return
    }

    // Remote writes are only queued, so a dry run can still build the batch and report
    // its size without sending anything.
    const applyWrites = remote || !dryRun
    const verb = dryRun ? 'would push' : 'pushed'

    if (parts.has('content')) {
      const snapshot = parseContentSnapshot(await fs.readFile(seedFilePath(root, 'content'), 'utf8'))
      if (applyWrites) {
        await pushContent(db, snapshot)
      }
      console.log(
        `cms-sync: ${verb} ${snapshot.pages.length} pages, ${snapshot.faqs.length} FAQs, ${snapshot.events.length} events, ${snapshot.nav.length} nav items and settings to ${where}`
      )
    }
    if (parts.has('products')) {
      const { seedProductRecords } = await import('../app/cms/seed-products')
      if (applyWrites) {
        await pushSeedProducts(db, seedProductRecords)
        await trashRowsMissingFrom(
          db,
          'products',
          'id',
          seedProductRecords.map((product) => product.id)
        )
      }
      console.log(`cms-sync: ${verb} ${seedProductRecords.length} products to ${where}`)
    }

    // The library rows have to be queued before the flush, so the bucket reconcile that
    // follows works from a database that already knows the new keys.
    const library = parts.has('media') ? parseMediaSnapshot(await fs.readFile(seedFilePath(root, 'media'), 'utf8')) : null
    if (library) {
      if (applyWrites) {
        await pushMediaLibrary(db, library)
      }
      console.log(`cms-sync: ${verb} ${library.media.length} media rows to ${where}`)
    }

    if (remote) {
      const queue = db as RemoteCmsDb
      if (dryRun) {
        console.log(`cms-sync: ${queue.pending()} statements would be sent to remote D1`)
      } else if (queue.pending() > 0) {
        await queue.flush()
      }
    }

    if (library) {
      const mediaRowKeys = library.media.map((entry) => entry.key)
      const cached = cachedMediaSource(root)
      const result = remote
        ? await syncRemoteMedia({ root, mediaRowKeys, dryRun, fallback: firstMediaSource(cached, localBucketSource) })
        : await syncLocalMedia({
            root,
            bucket: local!.media,
            mediaRowKeys,
            dryRun,
            fallback: firstMediaSource(cached, publicMediaSource())
          })
      const mediaVerb = dryRun ? 'would sync' : 'synced'
      console.log(
        `cms-sync: ${mediaVerb} ${where} media — ${result.encoded.length} images re-encoded, ${result.uploaded} objects uploaded, ${result.removed.length} removed, ${result.unchanged} unchanged`
      )
      if (result.skipped.length > 0) {
        console.log(`cms-sync: no source found for ${result.skipped.join(', ')}`)
      }
    }
  } finally {
    await local?.dispose()
    await fallbackCms?.dispose()
  }
}

await run()
