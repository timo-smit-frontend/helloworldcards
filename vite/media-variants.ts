import fs from 'node:fs/promises'
import path from 'node:path'
import type { MediaBucket } from '../worker/cms/media'
import { mediaVariantKey, variantWidthsFor, type ImageFormat } from '../app/services/responsiveImage'
import { IMAGE_FORMATS, resizeToFormat } from './responsive-image-build'

const ORIGINAL_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const

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

export async function encodeMediaVariants(originalPath: string, originalKey: string): Promise<Map<string, Buffer>> {
  const variants = new Map<string, Buffer>()
  for (const width of variantWidthsFor()) {
    for (const format of IMAGE_FORMATS) {
      const key = mediaVariantKey(originalKey, width, format)
      variants.set(key, await resizeToFormat(originalPath, width, format))
    }
  }
  return variants
}

export async function putMediaVariants(
  bucket: MediaBucket,
  originalPath: string,
  originalKey: string,
  skipExisting = true
): Promise<number> {
  const variants = await encodeMediaVariants(originalPath, originalKey)
  let uploaded = 0

  for (const [key, buffer] of variants) {
    if (skipExisting && (await bucket.get(key))) {
      continue
    }
    const format = key.endsWith('.avif') ? 'avif' : 'webp'
    await bucket.put(key, buffer, { httpMetadata: { contentType: contentType(format) } })
    uploaded += 1
  }

  return uploaded
}

export async function seedMediaWithVariants(
  bucket: MediaBucket,
  seedDir: string,
  files: ReadonlyArray<{ key: string; filename: string; contentType: string }>
): Promise<void> {
  for (const file of files) {
    const originalPath = path.join(seedDir, file.filename)
    if (!(await bucket.get(file.key))) {
      const bytes = await fs.readFile(originalPath)
      await bucket.put(file.key, bytes, { httpMetadata: { contentType: file.contentType } })
    }
    await putMediaVariants(bucket, originalPath, file.key)
  }
}
