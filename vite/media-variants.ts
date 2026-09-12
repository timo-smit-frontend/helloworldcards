import fs from 'node:fs/promises'
import path from 'node:path'
import type { MediaBucket } from '../worker/cms/media'
import { mediaVariantKey, variantWidthsFor, type ImageFormat } from '../app/services/responsiveImage'
import { IMAGE_FORMATS, defaultVariantConcurrency, mapPool, resizeToFormat } from './responsive-image-build'

const ORIGINAL_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const

/**
 * Encoding every variant outlives a short-lived dev or `vite-node` process, and the
 * Wrangler bucket stub is poisoned the moment that process disposes its platform proxy.
 * A signal lets the seeding stop between writes instead of failing against a dead stub.
 */
export type SeedSignal = { readonly aborted: boolean }

function contentType(format: ImageFormat): string {
  return format === 'avif' ? 'image/avif' : 'image/webp'
}

export async function findSeedMediaOriginal(seedDir: string, stem: string): Promise<string | undefined> {
  const base = path.basename(stem)
  for (const extension of ORIGINAL_EXTENSIONS) {
    const candidate = path.join(seedDir, `${base}${extension}`)
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * Every size and format of one original. The encodes run a few at a time — like the
 * production build does — rather than one after another; the map keeps the build's
 * width-then-format order so callers and manifests see the same sequence as before.
 */
export async function encodeMediaVariants(originalPath: string, originalKey: string): Promise<Map<string, Buffer>> {
  const jobs = variantWidthsFor().flatMap((width) => IMAGE_FORMATS.map((format) => ({ width, format })))
  const encoded = new Map<string, Buffer>()
  await mapPool(jobs, defaultVariantConcurrency(), async ({ width, format }) => {
    encoded.set(mediaVariantKey(originalKey, width, format), await resizeToFormat(originalPath, width, format))
  })
  return new Map(
    jobs.map(({ width, format }) => {
      const key = mediaVariantKey(originalKey, width, format)
      return [key, encoded.get(key)!]
    })
  )
}

export async function putMediaVariants(
  bucket: MediaBucket,
  originalPath: string,
  originalKey: string,
  skipExisting = true,
  signal?: SeedSignal
): Promise<number> {
  const variants = await encodeMediaVariants(originalPath, originalKey)
  let uploaded = 0

  // A few writes in flight at once: the bucket is local, but each put is still a round trip.
  await mapPool([...variants], 4, async ([key, buffer]) => {
    if (signal?.aborted) {
      return
    }
    if (skipExisting && (await (bucket.head ? bucket.head(key) : bucket.get(key)))) {
      return
    }
    const format = key.endsWith('.avif') ? 'avif' : 'webp'
    await bucket.put(key, buffer, { httpMetadata: { contentType: contentType(format) } })
    uploaded += 1
  })

  return uploaded
}

export async function seedMediaWithVariants(
  bucket: MediaBucket,
  seedDir: string,
  files: ReadonlyArray<{ key: string; filename: string; contentType: string }>,
  options?: { variants?: boolean; signal?: SeedSignal }
): Promise<void> {
  const variants = options?.variants ?? true
  const signal = options?.signal
  for (const file of files) {
    if (signal?.aborted) {
      return
    }
    const originalPath = path.join(seedDir, file.filename)
    if (!(await (bucket.head ? bucket.head(file.key) : bucket.get(file.key)))) {
      const bytes = await fs.readFile(originalPath)
      await bucket.put(file.key, bytes, { httpMetadata: { contentType: file.contentType } })
    }
    if (variants) {
      await putMediaVariants(bucket, originalPath, file.key, true, signal)
    }
  }
}
