import type { CmsMedia, CmsMediaFolder } from '~/cms/types'

/** The drag payload type for a library image, so a folder only takes images and not, say, a file from the desktop. */
export const MEDIA_DRAG_TYPE = 'application/x-hwc-media-id'

/** What one level of the library shows: the top (`null`) or the inside of one folder. */
export function mediaInFolder<T extends { folderId: number | null }>(items: T[], folderId: number | null): T[] {
  return items.filter((item) => (item.folderId ?? null) === folderId)
}

export function countMediaByFolder(items: Array<{ folderId: number | null }>): Map<number, number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    if (item.folderId != null) {
      counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1)
    }
  }
  return counts
}

/** Put one image in a folder — or back at the top with `null` — leaving every other row as it was. */
export function moveMediaTo(items: CmsMedia[], id: number, folderId: number | null): CmsMedia[] {
  return items.map((item) => (item.id === id ? { ...item, folderId } : item))
}

/** Folders the way the grid lists them: by name, regardless of case, like a file browser. */
export function sortMediaFolders(folders: CmsMediaFolder[]): CmsMediaFolder[] {
  return [...folders].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.id - right.id)
}

/** The folder a picker should open in: where its current image sits, or the top when it has none. */
export function folderOfUrl(items: CmsMedia[], url: string): number | null {
  return items.find((item) => item.url === url)?.folderId ?? null
}

export function imageCountLabel(count: number): string {
  return count === 1 ? '1 image' : `${count} images`
}
