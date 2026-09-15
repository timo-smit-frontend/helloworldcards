import type { CmsMedia } from '../../app/cms/types'
import {
  deleteMediaExcept,
  deleteMediaFoldersExcept,
  listMedia,
  listMediaFolders,
  upsertMediaByKey,
  upsertMediaFolderByName,
  type CmsDb
} from './db'

/**
 * One media row as it travels between environments: everything but the autoincrement id
 * and the derived URL, neither of which is portable. The folder goes by name for the
 * same reason — its id is whatever the target database handed out.
 */
type CmsMediaEntry = Omit<CmsMedia, 'id' | 'url' | 'folderId'> & { folder: string | null }

/**
 * The media library in a form that round-trips through `seed/cms-media.json`. The image
 * bytes stay in R2; this is the index that tells each environment which originals its
 * bucket should hold and what they are called, so an image replaced in one admin is not
 * lost on the way to the other. Folders are listed on their own as well, so that one
 * made but not yet filled still turns up on the other side.
 */
export type CmsMediaSnapshot = {
  folders: string[]
  media: CmsMediaEntry[]
}

function toEntry(media: CmsMedia, folderNames: Map<number, string>): CmsMediaEntry {
  return {
    key: media.key,
    filename: media.filename,
    contentType: media.contentType,
    width: media.width,
    height: media.height,
    bytes: media.bytes,
    title: media.title,
    alt: media.alt,
    folder: media.folderId != null ? (folderNames.get(media.folderId) ?? null) : null,
    createdAt: media.createdAt
  }
}

export async function pullMediaLibrary(db: CmsDb): Promise<CmsMediaSnapshot> {
  const folders = await listMediaFolders(db)
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]))
  // Ordered by key so the committed file diffs as a change to one image, not a reshuffle.
  const media = (await listMedia(db)).map((item) => toEntry(item, folderNames)).sort((left, right) => left.key.localeCompare(right.key))
  return { folders: folders.map((folder) => folder.name).sort((left, right) => left.localeCompare(right)), media }
}

export async function pushMediaLibrary(db: CmsDb, snapshot: CmsMediaSnapshot): Promise<number> {
  // Folders first: the rows that follow point at them by name.
  const folders = new Set(snapshot.folders)
  for (const entry of snapshot.media) {
    if (entry.folder) {
      folders.add(entry.folder)
    }
  }
  for (const name of folders) {
    await upsertMediaFolderByName(db, name)
  }
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
    await deleteMediaFoldersExcept(db, [...folders])
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
  // A file written before folders existed has none, and its rows sit at the top.
  const folders = Array.isArray(parsed.folders) ? parsed.folders.filter((name): name is string => typeof name === 'string') : []
  return { folders, media: parsed.media.map((entry) => ({ ...entry, folder: typeof entry.folder === 'string' ? entry.folder : null })) }
}
