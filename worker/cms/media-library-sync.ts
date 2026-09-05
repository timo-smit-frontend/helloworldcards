import type { CmsMedia } from '../../app/cms/types'
import { deleteMediaExcept, listMedia, upsertMediaByKey, type CmsDb } from './db'

/**
 * One media row as it travels between environments: everything but the autoincrement id
 * and the derived URL, neither of which is portable.
 */
export type CmsMediaEntry = Omit<CmsMedia, 'id' | 'url'>

/**
 * The media library in a form that round-trips through `seed/cms-media.json`. The image
 * bytes stay in R2; this is the index that tells each environment which originals its
 * bucket should hold and what they are called, so an image replaced in one admin is not
 * lost on the way to the other.
 */
export type CmsMediaSnapshot = {
  media: CmsMediaEntry[]
}

function toEntry(media: CmsMedia): CmsMediaEntry {
  return {
    key: media.key,
    filename: media.filename,
    contentType: media.contentType,
    width: media.width,
    height: media.height,
    bytes: media.bytes,
    title: media.title,
    alt: media.alt,
    createdAt: media.createdAt
  }
}

export async function pullMediaLibrary(db: CmsDb): Promise<CmsMediaSnapshot> {
  // Ordered by key so the committed file diffs as a change to one image, not a reshuffle.
  const media = (await listMedia(db)).map(toEntry).sort((left, right) => left.key.localeCompare(right.key))
  return { media }
}

export async function pushMediaLibrary(db: CmsDb, snapshot: CmsMediaSnapshot): Promise<number> {
  for (const entry of snapshot.media) {
    await upsertMediaByKey(db, entry)
  }
  // An empty snapshot is far more likely a broken read than a request to empty the
  // library, so nothing is pruned unless the snapshot actually describes a library.
  if (snapshot.media.length > 0) {
    await deleteMediaExcept(
      db,
      snapshot.media.map((entry) => entry.key)
    )
  }
  return snapshot.media.length
}

export function formatMediaSnapshot(snapshot: CmsMediaSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function parseMediaSnapshot(source: string): CmsMediaSnapshot {
  const parsed = JSON.parse(source) as Partial<CmsMediaSnapshot>
  if (!Array.isArray(parsed.media)) {
    throw new Error('seed/cms-media.json is not a CMS media library snapshot.')
  }
  return { media: parsed.media }
}
