import fs from 'node:fs/promises'
import path from 'node:path'
import prettier from 'prettier'
import { fileURLToPath } from 'node:url'
import { formatSeedProductsSource } from '../app/cms/format-seed-products'
import { seedProductRecords } from '../app/cms/seed-products'
import type { ProductRecord } from '../app/database/products'
import { formatContentSnapshot, parseContentSnapshot, pullContent, pushContent } from '../worker/cms/content-sync'
import { rowToRecord, type CmsDb } from '../worker/cms/db'
import { ensureSeeded } from '../worker/cms/seed'
import { ensureCmsSchema } from '../test/helpers/memory-d1'
import { formatGeneratedFile, openLocalCms, pushSeedProducts, remoteCmsDb, type RemoteCmsDb } from '../vite/cms-sync'
import { listMediaRowKeys, syncLocalMedia, syncRemoteMedia } from '../vite/media-sync'
import { formatSeedMediaSource, readSeedMediaDir } from '../vite/seed-media-source'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))

const remote = args.has('--remote')
const direction = args.has('--pull') ? 'pull' : 'push'
const dryRun = args.has('--dry-run')
const only = ['content', 'products', 'media'].filter((part) => args.has(`--${part}`))
const parts = new Set(only.length > 0 ? only : ['content', 'products', 'media'])

const snapshotPath = path.join(root, 'seed/cms-content.json')
const productsPath = path.join(root, 'app/cms/seed-products.ts')
const seedMediaPath = path.join(root, 'app/cms/seed-media.ts')
const where = remote ? 'remote' : 'local'

async function readProducts(db: CmsDb): Promise<ProductRecord[]> {
  const { results } = await db
    .prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY id ASC')
    .all<Parameters<typeof rowToRecord>[0]>()
  return results.map(rowToRecord)
}

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
      if (parts.has('content')) {
        const snapshot = await pullContent(db)
        if (!dryRun) {
          await fs.writeFile(snapshotPath, formatContentSnapshot(snapshot))
          formatGeneratedFile(snapshotPath)
        }
        console.log(
          `cms-sync: pulled ${snapshot.pages.length} pages, ${snapshot.faqs.length} FAQs, ${snapshot.events.length} events, ${snapshot.nav.length} nav items and settings from ${where}`
        )
      }
      if (parts.has('products')) {
        const products = await readProducts(db)
        if (!dryRun) {
          await fs.writeFile(productsPath, formatSeedProductsSource(products))
          formatGeneratedFile(productsPath)
        }
        console.log(`cms-sync: pulled ${products.length} products from ${where}`)
      }
      if (parts.has('media')) {
        console.log('cms-sync: media lives in R2 only; run a push to reconcile the bucket')
      }
      return
    }

    // Remote writes are only queued, so a dry run can still build the batch and report
    // its size without sending anything.
    const applyWrites = remote || !dryRun
    const verb = dryRun ? 'would push' : 'pushed'

    if (parts.has('content')) {
      const snapshot = parseContentSnapshot(await fs.readFile(snapshotPath, 'utf8'))
      if (applyWrites) {
        await pushContent(db, snapshot)
      }
      console.log(
        `cms-sync: ${verb} ${snapshot.pages.length} pages, ${snapshot.faqs.length} FAQs, ${snapshot.events.length} events, ${snapshot.nav.length} nav items and settings to ${where}`
      )
    }
    if (parts.has('products')) {
      if (applyWrites) {
        await pushSeedProducts(db)
      }
      console.log(`cms-sync: ${verb} ${seedProductRecords.length} products to ${where}`)
    }

    if (remote) {
      const queue = db as RemoteCmsDb
      if (dryRun) {
        console.log(`cms-sync: ${queue.pending()} statements would be sent to remote D1`)
      } else if (queue.pending() > 0) {
        await queue.flush()
      }
    }

    if (parts.has('media')) {
      const mediaRowKeys = await listMediaRowKeys(db)
      const result = remote
        ? await syncRemoteMedia({ root, mediaRowKeys, dryRun })
        : await syncLocalMedia({ root, bucket: local!.media, mediaRowKeys, dryRun })
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
  }
}

await run()
