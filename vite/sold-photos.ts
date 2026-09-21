import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import prettier from 'prettier'
import sharp from 'sharp'
import { allMediaVariantKeys } from '../app/services/responsiveImage'
import {
  SOLD_MEDIA_FOLDER,
  SOLD_PHOTO_WIDTH,
  certOfSlabPhotoKey,
  mediaKeyOf,
  soldPhotoName,
  soldPhotoPlan
} from '../app/services/sold-photos'
import { ensureMediaFolder, keepSoldPhoto, rowToRecord, type CmsDb, type ProductRow, type SoldPhotoRow } from '../worker/cms/db'
import type { MediaBucket } from '../worker/cms/media'
import { cacheMediaOriginal } from './media-originals'
import type { MediaSourceReader } from './media-sync'
import { putMediaVariants } from './media-variants'
import { formatSeedMediaSource, readSeedMediaDir } from './seed-media-source'

/** Same as the site's own 400 px WebP resize, which is what the dashboard showed before. */
const SOLD_PHOTO_QUALITY = 75

export type SoldPhotoArchiveOptions = {
  root: string
  db: CmsDb
  media: MediaBucket
  /** Where an original comes from when neither the seed files nor the bucket have it. */
  readOriginal?: MediaSourceReader
  log?: (message: string) => void
}

export type SoldPhotoArchiveResult = {
  /** The cards cut down to one small photo this run. */
  archived: Array<{ id: number; title: string }>
  /** The cards left as they were because their front photo could not be read anywhere. */
  skipped: Array<{ id: number; title: string; key: string }>
}

/** The bytes of one original: the committed file, the bucket, or wherever else the caller can look. */
async function originalBytes(
  root: string,
  media: MediaBucket,
  readOriginal: MediaSourceReader | undefined,
  key: string
): Promise<Buffer | null> {
  const seedFile = await fs.readFile(seedMediaPath(root, key)).catch(() => null)
  if (seedFile) {
    return seedFile
  }
  const object = await media.get(key)
  if (object) {
    return Buffer.from(await object.arrayBuffer())
  }
  return (await readOriginal?.(key)) ?? null
}

function seedMediaPath(root: string, key: string): string {
  // Keys are slugs, but a key from elsewhere must not reach outside seed/media.
  return path.join(root, 'seed/media', path.basename(key))
}

/** Remove a committed original, saying whether there was one. */
async function removeSeedFile(root: string, key: string): Promise<boolean> {
  const file = seedMediaPath(root, key)
  try {
    await fs.access(file)
  } catch {
    return false
  }
  await fs.rm(file, { force: true })
  return true
}

/**
 * `app/cms/seed-media.ts` lists what `seed/media` holds, so it is written again once a
 * file has left — the same way `npm run cms:seed-media` writes it, Prettier included.
 */
async function regenerateSeedMediaSource(root: string): Promise<void> {
  const filePath = path.join(root, 'app/cms/seed-media.ts')
  const source = formatSeedMediaSource(await readSeedMediaDir(path.join(root, 'seed/media')))
  await fs.writeFile(filePath, await prettier.format(source, { ...(await prettier.resolveConfig(filePath)), filepath: filePath }))
}

/** The branded ad photo of a card, which its listings led with; gone once they are. */
async function removeAdPhoto(root: string, cert: string): Promise<boolean> {
  const file = path.join(root, 'public/ads', `${cert}.jpeg`)
  try {
    await fs.access(file)
  } catch {
    return false
  }
  await fs.rm(file, { force: true })
  return true
}

/**
 * Cut every sold card down to the one small photo it keeps: the front, at the width the
 * dashboard shows it, in the Sold folder of the library. The back photo and both
 * originals go — from the bucket with every resize, from `seed/media` when they were
 * committed — and so does the branded ad photo. The product row is left as it is apart
 * from its image list: the sale itself stays on the books in full.
 *
 * Runs against the local database and bucket; the sync carries the result to production
 * the way it carries any other edit. Safe to run again: a card that already keeps just
 * its small photo is passed over.
 */
export async function archiveSoldPhotos(options: SoldPhotoArchiveOptions): Promise<SoldPhotoArchiveResult> {
  const { root, db, media, readOriginal, log = () => {} } = options
  const result: SoldPhotoArchiveResult = { archived: [], skipped: [] }
  const { results } = await db.prepare('SELECT * FROM products WHERE sold = 1 AND deleted_at IS NULL ORDER BY id ASC').all<ProductRow>()
  let seedFilesRemoved = false

  for (const row of results) {
    const product = rowToRecord(row)
    const plan = soldPhotoPlan(product)
    if (!plan) {
      continue
    }
    const gone = [...(plan.shrink ? [plan.shrink] : []), ...plan.drop]
    let replace: { front: string; photo: SoldPhotoRow } | null = null
    // Nothing to shrink means the kept photo and its row are already in place; only the
    // extra photos remain to be dropped.
    let keep = mediaKeyOf(product.images![0])!

    if (plan.shrink) {
      const bytes = await originalBytes(root, media, readOriginal, plan.shrink)
      if (!bytes) {
        result.skipped.push({ id: product.id, title: product.title, key: plan.shrink })
        continue
      }
      keep = soldPhotoName(plan.shrink)
      const { data, info } = await sharp(bytes)
        .resize({ width: SOLD_PHOTO_WIDTH, withoutEnlargement: true })
        .webp({ quality: SOLD_PHOTO_QUALITY })
        .toBuffer({ resolveWithObject: true })
      // The bucket gets the photo and its resizes before the database points at it, and
      // the sync's cache of uploads gets a copy so the push to production can read it.
      const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-sold-'))
      try {
        const file = path.join(temporary, path.basename(keep))
        await fs.writeFile(file, data)
        await media.put(keep, data, { httpMetadata: { contentType: 'image/webp' } })
        await putMediaVariants(media, file, keep, false)
      } finally {
        await fs.rm(temporary, { recursive: true, force: true })
      }
      await cacheMediaOriginal(root, keep, data)
      replace = {
        front: plan.shrink,
        photo: {
          key: keep,
          filename: soldPhotoName(path.basename(plan.shrink)),
          contentType: 'image/webp',
          bytes: data.byteLength,
          width: info.width,
          height: info.height,
          folderId: await ensureMediaFolder(db, SOLD_MEDIA_FOLDER)
        }
      }
    }

    await keepSoldPhoto(db, { productId: product.id, keep, replace, drop: plan.drop })
    await media.delete(gone.flatMap((key) => [key, ...allMediaVariantKeys(key)]))

    const notes = [replace ? `kept ${replace.photo.width} px ${keep}` : `kept ${keep}`, `dropped ${gone.join(', ')}`]
    for (const key of gone) {
      if (await removeSeedFile(root, key)) {
        seedFilesRemoved = true
        notes.push(`removed seed/media/${path.basename(key)}`)
      }
    }
    const cert = certOfSlabPhotoKey(plan.shrink ?? keep)
    if (cert && (await removeAdPhoto(root, cert))) {
      notes.push(`removed public/ads/${cert}.jpeg`)
    }
    log(`${product.title} is sold: ${notes.join('; ')}`)
    result.archived.push({ id: product.id, title: product.title })
  }

  if (seedFilesRemoved) {
    await regenerateSeedMediaSource(root)
  }
  return result
}
