import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { seedMediaFiles } from '../app/cms/seed-media'
import {
  emptyMediaObjectIndex,
  planMediaSync,
  withSyncedObject,
  withoutSyncedObjects,
  type MediaObjectIndex,
  type MediaSyncSource
} from '../app/services/mediaSync'
import { allMediaVariantKeys } from '../app/services/responsiveImage'
import type { MediaBucket } from '../worker/cms/media'
import { encodeMediaVariants } from './media-variants'
import { variantSettingsKey } from './responsive-image-build'

const R2_BUCKET = 'helloworldcards-media'
const MANIFEST_KEY = '_media-variants-manifest.json'
const PUBLIC_MEDIA_ORIGIN = 'https://helloworldcards.com'

export type MediaSyncTarget = 'local' | 'remote'

export type MediaSyncResult = {
  target: MediaSyncTarget
  encoded: string[]
  uploaded: number
  removed: string[]
  unchanged: number
  skipped: string[]
}

/** The manifest before variant bookkeeping was added: file hashes only. */
type LegacyManifest = { settings: string; files: Record<string, string> }

export function upgradeMediaIndex(parsed: unknown, settings: string): MediaObjectIndex {
  if (!parsed || typeof parsed !== 'object') {
    return emptyMediaObjectIndex(settings)
  }
  const candidate = parsed as Partial<MediaObjectIndex> & Partial<LegacyManifest>
  if (candidate.objects) {
    return { settings: candidate.settings ?? settings, objects: candidate.objects }
  }
  if (!candidate.files) {
    return emptyMediaObjectIndex(settings)
  }
  // A legacy manifest recorded every width in force at the time, so the variant list can
  // be reconstructed and the run does not have to re-upload the whole bucket.
  const objects: MediaObjectIndex['objects'] = {}
  for (const [key, hash] of Object.entries(candidate.files)) {
    objects[key] = { hash, variants: allMediaVariantKeys(key) }
  }
  return { settings: candidate.settings ?? settings, objects }
}

async function hashBytes(bytes: Uint8Array | Buffer): Promise<string> {
  const hash = createHash('sha256')
  hash.update(variantSettingsKey())
  hash.update(bytes)
  return hash.digest('hex').slice(0, 16)
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

/**
 * Originals the bucket should hold: everything committed under `seed/media`, plus every
 * media row in the database — an image uploaded through the admin has no file in the
 * repo but still needs its full set of sizes.
 */
export async function collectMediaSources(seedDir: string, mediaRowKeys: string[]): Promise<MediaSyncSource[]> {
  const sources = new Map<string, MediaSyncSource>()

  for (const file of seedMediaFiles) {
    try {
      sources.set(file.key, { key: file.key, hash: await hashBytes(await fs.readFile(path.join(seedDir, file.filename))) })
    } catch {
      // A seed entry with no file on disk is reported by the caller, not silently synced.
    }
  }

  for (const key of mediaRowKeys) {
    if (!sources.has(key)) {
      sources.set(key, { key, hash: null })
    }
  }

  return [...sources.values()]
}

export async function listMediaRowKeys(db: { prepare(query: string): { all<T>(): Promise<{ results: T[] }> } }): Promise<string[]> {
  const { results } = await db.prepare('SELECT key FROM media ORDER BY id ASC').all<{ key: string }>()
  return results.map((row) => row.key)
}

type MediaStore = {
  listKeys(): Promise<string[] | null>
  read(key: string): Promise<Buffer | null>
  put(key: string, bytes: Buffer, contentType: string): Promise<void>
  delete(key: string): Promise<void>
  readIndex(settings: string): Promise<MediaObjectIndex>
  writeIndex(index: MediaObjectIndex): Promise<void>
}

function contentTypeFor(key: string): string {
  if (key.endsWith('.avif')) return 'image/avif'
  if (key.endsWith('.webp')) return 'image/webp'
  if (key.endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

function localStore(bucket: MediaBucket & { list?: (options?: unknown) => Promise<unknown> }, cacheDir: string): MediaStore {
  const indexPath = path.join(cacheDir, 'local-media-index.json')
  return {
    async listKeys() {
      if (typeof bucket.list !== 'function') {
        return null
      }
      const keys: string[] = []
      let cursor: string | undefined
      do {
        const page = (await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) })) as {
          objects: Array<{ key: string }>
          truncated?: boolean
          cursor?: string
        }
        keys.push(...page.objects.map((object) => object.key))
        cursor = page.truncated ? page.cursor : undefined
      } while (cursor)
      return keys
    },
    async read(key) {
      const object = await bucket.get(key)
      return object ? Buffer.from(await object.arrayBuffer()) : null
    },
    async put(key, bytes, contentType) {
      await bucket.put(key, bytes, { httpMetadata: { contentType } })
    },
    async delete(key) {
      await bucket.delete(key)
    },
    async readIndex(settings) {
      return upgradeMediaIndex(await readJsonFile(indexPath), settings)
    },
    async writeIndex(index) {
      await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`)
    }
  }
}

function wrangler(args: string[], options: { stdio?: 'inherit' | 'ignore' | 'pipe' } = {}): string {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: options.stdio ?? 'pipe' }) ?? ''
}

function remoteStore(cacheDir: string): MediaStore {
  const manifestPath = path.join(cacheDir, MANIFEST_KEY)
  return {
    // Wrangler cannot list R2 objects, so the manifest is the only inventory available.
    async listKeys() {
      return null
    },
    async read(key) {
      const response = await fetch(`${PUBLIC_MEDIA_ORIGIN}/media/${encodeURIComponent(key)}`)
      if (!response.ok) {
        return null
      }
      return Buffer.from(await response.arrayBuffer())
    },
    async put(key, bytes, contentType) {
      const filePath = path.join(cacheDir, path.basename(key))
      await fs.writeFile(filePath, bytes)
      wrangler(['r2', 'object', 'put', `${R2_BUCKET}/${key}`, '--file', filePath, '--content-type', contentType, '--remote'], {
        stdio: 'inherit'
      })
    },
    async delete(key) {
      wrangler(['r2', 'object', 'delete', `${R2_BUCKET}/${key}`, '--remote'], { stdio: 'inherit' })
    },
    async readIndex(settings) {
      try {
        wrangler(['r2', 'object', 'get', `${R2_BUCKET}/${MANIFEST_KEY}`, '--remote', '--file', manifestPath], { stdio: 'ignore' })
      } catch {
        // No manifest yet: treat the bucket as unmanaged and upload everything.
      }
      return upgradeMediaIndex(await readJsonFile(manifestPath), settings)
    },
    async writeIndex(index) {
      await fs.writeFile(manifestPath, JSON.stringify(index))
      wrangler(
        ['r2', 'object', 'put', `${R2_BUCKET}/${MANIFEST_KEY}`, '--file', manifestPath, '--content-type', 'application/json', '--remote'],
        {
          stdio: 'inherit'
        }
      )
    }
  }
}

async function sourceBytes(key: string, seedDir: string, store: MediaStore): Promise<Buffer | null> {
  const seedFile = seedMediaFiles.find((file) => file.key === key)
  if (seedFile) {
    try {
      return await fs.readFile(path.join(seedDir, seedFile.filename))
    } catch {
      return null
    }
  }
  return store.read(key)
}

/**
 * Bring one bucket's variant set in line with the originals it should hold: encode and
 * upload every size for a new or changed image, and delete the sizes that no longer
 * belong — a retired width, or an image that is gone.
 */
export async function syncMediaBucket(options: {
  root: string
  store: MediaStore
  mediaRowKeys: string[]
  target: MediaSyncTarget
  dryRun?: boolean
  prune?: boolean
  log?: (message: string) => void
}): Promise<MediaSyncResult> {
  const { root, store, mediaRowKeys, target, dryRun = false, prune = true } = options
  const log = options.log ?? console.log
  const seedDir = path.join(root, 'seed/media')
  const cacheDir = path.join(root, '.cache', 'media-variants')
  await fs.mkdir(cacheDir, { recursive: true })

  const settings = variantSettingsKey()
  const sources = await collectMediaSources(seedDir, mediaRowKeys)
  const index = await store.readIndex(settings)
  const bucketKeys = await store.listKeys()
  const plan = planMediaSync({ sources, index, settings, bucketKeys, prune })

  const result: MediaSyncResult = {
    target,
    encoded: [],
    uploaded: 0,
    removed: [],
    unchanged: plan.unchanged.length,
    skipped: []
  }

  if (dryRun) {
    return { ...result, encoded: plan.encode, removed: plan.remove }
  }

  let next: MediaObjectIndex = { settings, objects: index.objects }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-media-'))

  try {
    for (const key of plan.encode) {
      const bytes = await sourceBytes(key, seedDir, store)
      if (!bytes) {
        result.skipped.push(key)
        log(`media-sync: no source for ${key}, skipping`)
        continue
      }

      // Only the original is guaranteed present in the bucket; encoding needs a file.
      const originalPath = path.join(temporary, path.basename(key))
      await fs.writeFile(originalPath, bytes)

      // A source that only lives in the bucket still needs its original in place when the
      // bucket has lost it.
      if (bucketKeys && !bucketKeys.includes(key)) {
        await store.put(key, bytes, contentTypeFor(key))
        result.uploaded += 1
      }

      const variants = await encodeMediaVariants(originalPath, key)
      for (const [variantKey, buffer] of variants) {
        await store.put(variantKey, buffer, contentTypeFor(variantKey))
        result.uploaded += 1
      }

      next = withSyncedObject(next, key, await hashBytes(bytes), [...variants.keys()])
      result.encoded.push(key)
      log(`media-sync: ${key} -> ${variants.size} variants`)
    }

    for (const key of plan.remove) {
      await store.delete(key)
      result.removed.push(key)
      log(`media-sync: removed ${key}`)
    }

    if (prune) {
      next = withoutSyncedObjects(
        next,
        Object.keys(next.objects).filter((key) => !sources.some((source) => source.key === key))
      )
    }
    await store.writeIndex(next)
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }

  return result
}

export async function syncRemoteMedia(options: {
  root: string
  mediaRowKeys: string[]
  dryRun?: boolean
  prune?: boolean
  log?: (message: string) => void
}): Promise<MediaSyncResult> {
  const cacheDir = path.join(options.root, '.cache', 'media-variants')
  await fs.mkdir(cacheDir, { recursive: true })
  return syncMediaBucket({ ...options, store: remoteStore(cacheDir), target: 'remote' })
}

export async function syncLocalMedia(options: {
  root: string
  bucket: MediaBucket
  mediaRowKeys: string[]
  dryRun?: boolean
  prune?: boolean
  log?: (message: string) => void
}): Promise<MediaSyncResult> {
  const cacheDir = path.join(options.root, '.cache', 'media-variants')
  await fs.mkdir(cacheDir, { recursive: true })
  return syncMediaBucket({ ...options, store: localStore(options.bucket, cacheDir), target: 'local' })
}

/**
 * Build-time upload of the committed seed media. It never prunes: a build knows the files
 * in `seed/media` but not the media rows in the database, so anything uploaded through the
 * admin has to be left alone. Run `npm run cms:push:remote` for a full reconcile.
 */
export async function uploadSeedMediaVariants(root: string, log = console.log): Promise<void> {
  if (process.env.HWC_SKIP_MEDIA_UPLOAD === '1') {
    return
  }
  if (process.env.WORKERS_CI === '1') {
    log('media-sync: skipping R2 upload on Workers Builds (run npm run cms:push:remote locally when seed media changes)')
    return
  }

  try {
    await fs.access(path.join(root, 'seed/media'))
  } catch {
    log('media-sync: no seed/media directory, skipping upload')
    return
  }

  const result = await syncRemoteMedia({ root, mediaRowKeys: [], prune: false, log })
  log(`media-sync: ${result.encoded.length} seed images encoded, ${result.uploaded} objects uploaded, ${result.unchanged} unchanged`)
}
