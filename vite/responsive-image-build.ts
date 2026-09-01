import { createHash } from 'node:crypto'
import { availableParallelism } from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { parseRasterVariant, rasterVariantSrc, variantWidthsFor, type ImageFormat } from '../app/services/responsiveImage'

const ORIGINAL_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const
export const IMAGE_FORMATS: ImageFormat[] = ['avif', 'webp']

export type VariantJob = {
  originalPath: string
  fileName: string
  width: number
  format: ImageFormat
}

export function encodeQuality(width: number, format: ImageFormat): number {
  if (format === 'avif') return width >= 1000 ? 45 : 50
  return width >= 1000 ? 70 : 75
}

export async function resizeToFormat(inputPath: string, width: number, format: ImageFormat): Promise<Buffer> {
  const image = sharp(inputPath).resize({ width, withoutEnlargement: true })
  const quality = encodeQuality(width, format)
  return format === 'avif' ? image.avif({ quality }).toBuffer() : image.webp({ quality }).toBuffer()
}

export function isOriginalImageEntry(entry: string): boolean {
  return !parseRasterVariant(`/${entry}`) && ORIGINAL_EXTENSIONS.some((extension) => entry.toLowerCase().endsWith(extension))
}

export async function listOriginalImageEntries(imagesDir: string): Promise<string[]> {
  const entries = await fs.readdir(imagesDir)
  return entries.filter(isOriginalImageEntry).sort()
}

export function variantFileName(entry: string, width: number, format: ImageFormat): string {
  const stem = path.posix.join('/images', entry.replace(/\.(png|jpe?g|webp)$/i, ''))
  return path.basename(rasterVariantSrc(`${stem}.png`, width, format))
}

export function variantSettingsKey(): string {
  return JSON.stringify({
    widths: variantWidthsFor(),
    formats: IMAGE_FORMATS,
    quality: IMAGE_FORMATS.flatMap((format) => variantWidthsFor().map((width) => [format, width, encodeQuality(width, format)]))
  })
}

export async function sourceCacheKey(originalPath: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(variantSettingsKey())
  hash.update(await fs.readFile(originalPath))
  return hash.digest('hex').slice(0, 16)
}

export function planVariantJobs(entries: string[], imagesDir: string): VariantJob[] {
  const jobs: VariantJob[] = []
  for (const entry of entries) {
    const originalPath = path.join(imagesDir, entry)
    for (const width of variantWidthsFor()) {
      for (const format of IMAGE_FORMATS) {
        jobs.push({
          originalPath,
          fileName: variantFileName(entry, width, format),
          width,
          format
        })
      }
    }
  }
  return jobs
}

async function exists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index
      index += 1
      await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
}

export function defaultVariantConcurrency(): number {
  return Math.max(1, Math.min(8, availableParallelism()))
}

export async function writeProductionVariants({
  imagesDir,
  outImagesDir,
  cacheDir,
  encode = (job) => resizeToFormat(job.originalPath, job.width, job.format),
  concurrency = defaultVariantConcurrency(),
  log = console.log
}: {
  imagesDir: string
  outImagesDir: string
  cacheDir: string
  encode?: (job: VariantJob) => Promise<Buffer>
  concurrency?: number
  log?: (message: string) => void
}): Promise<{ reused: number; generated: number }> {
  const entries = await listOriginalImageEntries(imagesDir)
  const jobs = planVariantJobs(entries, imagesDir)
  await fs.mkdir(outImagesDir, { recursive: true })

  const keyByOriginal = new Map<string, string>()
  for (const entry of entries) {
    const originalPath = path.join(imagesDir, entry)
    keyByOriginal.set(originalPath, await sourceCacheKey(originalPath))
  }

  const work = await Promise.all(
    jobs.map(async (job) => {
      const key = keyByOriginal.get(job.originalPath)
      if (!key) throw new Error(`Missing cache key for ${job.originalPath}`)
      const cachePath = path.join(cacheDir, key, job.fileName)
      return { job, cachePath, fresh: await exists(cachePath) }
    })
  )

  const reusedJobs = work.filter((item) => item.fresh)
  const generateJobs = work.filter((item) => !item.fresh)

  log(`responsive-images: reused ${reusedJobs.length} variants, encoding ${generateJobs.length}`)

  await Promise.all(
    reusedJobs.map(async ({ job, cachePath }) => {
      await fs.copyFile(cachePath, path.join(outImagesDir, job.fileName))
    })
  )

  await mapPool(generateJobs, concurrency, async ({ job, cachePath }) => {
    const body = await encode(job)
    await fs.mkdir(path.dirname(cachePath), { recursive: true })
    await Promise.all([fs.writeFile(cachePath, body), fs.writeFile(path.join(outImagesDir, job.fileName), body)])
  })

  const usedKeys = new Set(keyByOriginal.values())
  try {
    const cachedKeys = await fs.readdir(cacheDir)
    await Promise.all(
      cachedKeys.filter((key) => !usedKeys.has(key)).map((key) => fs.rm(path.join(cacheDir, key), { recursive: true, force: true }))
    )
  } catch {
    // cache dir may not exist when every original is new and encode produced no files
  }

  if (generateJobs.length > 0) {
    log(`responsive-images: encoded ${generateJobs.length} variants`)
  }

  return { reused: reusedJobs.length, generated: generateJobs.length }
}
