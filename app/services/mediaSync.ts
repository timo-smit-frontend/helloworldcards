import { allMediaVariantKeys, parseRasterVariant } from './responsiveImage'

/**
 * What the sync last put in the bucket. R2 has no listing over the Wrangler CLI, so for
 * the remote bucket this index *is* the inventory: only keys recorded here are ever
 * considered for deletion, which keeps admin uploads the sync never made safe.
 */
export type MediaIndexEntry = {
  hash: string
  variants: string[]
}

export type MediaObjectIndex = {
  settings: string
  objects: Record<string, MediaIndexEntry>
}

/** An original the bucket should hold, with the hash of its bytes when they are readable. */
export type MediaSyncSource = {
  key: string
  /** `null` when the source is only in the bucket (an admin upload), so it cannot change. */
  hash: string | null
}

export type MediaSyncPlan = {
  /** Originals whose variants must be re-encoded and uploaded. */
  encode: string[]
  /** Objects to delete: stale variants, retired widths, and originals no longer wanted. */
  remove: string[]
  /** Originals already correct in the bucket. */
  unchanged: string[]
}

export function emptyMediaObjectIndex(settings: string): MediaObjectIndex {
  return { settings, objects: {} }
}

/** Every key the bucket should hold for one original: the original plus all variants. */
export function expectedMediaKeys(key: string): string[] {
  return [key, ...allMediaVariantKeys(key)]
}

function originalStemOf(key: string): string | null {
  const variant = parseRasterVariant(`/${key}`)
  return variant ? variant.stem.replace(/^\//, '') : null
}

/**
 * Reconcile the bucket against the originals it should hold.
 *
 * `bucketKeys` is the real listing when one is available (the local Miniflare bucket, or
 * a worker with the binding). Without it the index stands in, so a remote run still
 * notices changed sources and retired widths.
 */
export function planMediaSync(input: {
  sources: MediaSyncSource[]
  index: MediaObjectIndex | null
  settings: string
  bucketKeys?: string[] | null
  /**
   * Delete objects the sources no longer cover. Pass `false` when `sources` is only part
   * of what the bucket should hold — a build-time run that knows the seed files but not
   * the media rows would otherwise wipe every image uploaded through the admin.
   */
  prune?: boolean
}): MediaSyncPlan {
  const { sources, index, settings, bucketKeys, prune = true } = input
  const settingsChanged = !index || index.settings !== settings
  const bucket = bucketKeys ? new Set(bucketKeys) : null

  const sourceKeys = new Set(sources.map((source) => source.key))
  const wanted = new Set(sources.flatMap((source) => expectedMediaKeys(source.key)))

  const encode: string[] = []
  const unchanged: string[] = []
  const remove = new Set<string>()

  for (const source of sources) {
    const entry = index?.objects[source.key]
    const variants = allMediaVariantKeys(source.key)

    // Widths or formats that were dropped from the build leave objects behind.
    for (const stale of entry?.variants ?? []) {
      if (!wanted.has(stale)) {
        remove.add(stale)
      }
    }

    const missingFromBucket = bucket ? [source.key, ...variants].some((key) => !bucket.has(key)) : false
    const sourceChanged = source.hash != null && entry != null && entry.hash !== source.hash
    if (settingsChanged || !entry || sourceChanged || missingFromBucket) {
      encode.push(source.key)
    } else {
      unchanged.push(source.key)
    }
  }

  // Originals the sync used to manage and no longer should: the file left seed/media, or
  // the media row was deleted.
  for (const [key, entry] of Object.entries(prune ? (index?.objects ?? {}) : {})) {
    if (sourceKeys.has(key)) {
      continue
    }
    remove.add(key)
    for (const variant of entry.variants) {
      remove.add(variant)
    }
  }

  // With a real listing, a variant nobody wants can be found directly rather than only
  // through the index: a retired width, or leftovers from a deleted media row. Only
  // variant keys are matched here, so originals and the manifest are never touched.
  for (const key of (prune ? bucketKeys : null) ?? []) {
    if (!wanted.has(key) && originalStemOf(key) != null) {
      remove.add(key)
    }
  }

  for (const key of wanted) {
    remove.delete(key)
  }

  return { encode, remove: [...remove].sort(), unchanged }
}

/** Record what an upload run put in the bucket, so the next run can retire it. */
export function withSyncedObject(index: MediaObjectIndex, key: string, hash: string, variants: string[]): MediaObjectIndex {
  return {
    settings: index.settings,
    objects: { ...index.objects, [key]: { hash, variants: [...variants].sort() } }
  }
}

export function withoutSyncedObjects(index: MediaObjectIndex, keys: string[]): MediaObjectIndex {
  const objects = { ...index.objects }
  for (const key of keys) {
    delete objects[key]
  }
  return { settings: index.settings, objects }
}
