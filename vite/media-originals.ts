import fs from 'node:fs/promises'
import path from 'node:path'
import type { MediaSourceReader } from './media-sync'

/**
 * Originals for images uploaded through an admin, which have no file under `seed/media`
 * and so live only in a bucket. Keeping a copy on disk lets a sync hand them to the other
 * environment without a second process having to open the local Wrangler state while the
 * dev server holds it.
 */
export function mediaOriginalsDir(root: string): string {
  return path.join(root, '.cache', 'media-originals')
}

function originalPath(root: string, key: string): string {
  // Keys are slugs made by the admin, but a key from elsewhere must not escape the cache.
  return path.join(mediaOriginalsDir(root), path.basename(key))
}

export async function cacheMediaOriginal(root: string, key: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(mediaOriginalsDir(root), { recursive: true })
  await fs.writeFile(originalPath(root, key), bytes)
}

export function cachedMediaSource(root: string): MediaSourceReader {
  return async (key) => fs.readFile(originalPath(root, key)).catch(() => null)
}

/** Chain readers so the cheapest source that has the bytes wins. */
export function firstMediaSource(...readers: Array<MediaSourceReader | undefined>): MediaSourceReader {
  return async (key) => {
    for (const reader of readers) {
      const bytes = await reader?.(key)
      if (bytes) {
        return bytes
      }
    }
    return null
  }
}
