import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { variantWidthsFor, type ImageFormat } from '../app/services/responsiveImage'
import { listOriginalImageEntries, mapPool, writeProductionVariants } from '../vite/responsive-image-build'

const IMAGE_FORMATS: ImageFormat[] = ['avif', 'webp']

async function makeDirs() {
  const root = await mkdtemp(path.join(tmpdir(), 'hwc-images-'))
  const imagesDir = path.join(root, 'images')
  const outImagesDir = path.join(root, 'dist', 'images')
  const cacheDir = path.join(root, '.cache', 'responsive-images')
  await mkdir(imagesDir, { recursive: true })
  await mkdir(outImagesDir, { recursive: true })
  return { root, imagesDir, outImagesDir, cacheDir }
}

describe('mapPool', () => {
  it('runs a few at a time and every item once', async () => {
    let running = 0
    let peak = 0
    const done: number[] = []
    await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running -= 1
      done.push(item)
    })
    expect(peak).toBe(3)
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('starts nothing new after a failure and waits for what is running before failing', async () => {
    const started: number[] = []
    let running = 0
    const failure = mapPool([1, 2, 3, 4, 5, 6], 2, async (item) => {
      started.push(item)
      running += 1
      await new Promise((resolve) => setTimeout(resolve, item === 1 ? 1 : 5))
      running -= 1
      if (item === 1) {
        throw new Error('upload failed')
      }
    })
    await expect(failure).rejects.toThrow('upload failed')
    expect(running).toBe(0)
    expect(started).toEqual([1, 2])
  })
})

describe('listOriginalImageEntries', () => {
  let root = ''

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('keeps originals and skips generated variants', async () => {
    const dirs = await makeDirs()
    root = dirs.root
    await writeFile(path.join(dirs.imagesDir, 'card.jpg'), 'jpg')
    await writeFile(path.join(dirs.imagesDir, 'card-w400.webp'), 'webp')
    await writeFile(path.join(dirs.imagesDir, 'notes.txt'), 'nope')

    await expect(listOriginalImageEntries(dirs.imagesDir)).resolves.toEqual(['card.jpg'])
  })
})

describe('writeProductionVariants', () => {
  let root = ''

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('encodes missing variants into cache and dist', async () => {
    const dirs = await makeDirs()
    root = dirs.root
    await writeFile(path.join(dirs.imagesDir, 'card.jpg'), 'jpg')
    const encode = vi.fn(async () => Buffer.from('encoded'))

    const result = await writeProductionVariants({
      imagesDir: dirs.imagesDir,
      outImagesDir: dirs.outImagesDir,
      cacheDir: dirs.cacheDir,
      encode
    })

    const expected = variantWidthsFor().length * IMAGE_FORMATS.length
    expect(result).toEqual({ reused: 0, generated: expected })
    expect(encode).toHaveBeenCalledTimes(expected)
    await expect(readFile(path.join(dirs.outImagesDir, 'card-w400.avif'), 'utf8')).resolves.toBe('encoded')
  })

  it('reuses cached variants when the original is unchanged', async () => {
    const dirs = await makeDirs()
    root = dirs.root
    await writeFile(path.join(dirs.imagesDir, 'card.jpg'), 'jpg')
    const encode = vi.fn(async () => Buffer.from('encoded'))

    await writeProductionVariants({
      imagesDir: dirs.imagesDir,
      outImagesDir: dirs.outImagesDir,
      cacheDir: dirs.cacheDir,
      encode
    })
    encode.mockClear()
    await rm(dirs.outImagesDir, { recursive: true, force: true })
    await mkdir(dirs.outImagesDir, { recursive: true })

    const result = await writeProductionVariants({
      imagesDir: dirs.imagesDir,
      outImagesDir: dirs.outImagesDir,
      cacheDir: dirs.cacheDir,
      encode
    })

    expect(result.generated).toBe(0)
    expect(result.reused).toBe(variantWidthsFor().length * IMAGE_FORMATS.length)
    expect(encode).not.toHaveBeenCalled()
    await expect(readFile(path.join(dirs.outImagesDir, 'card-w800.webp'), 'utf8')).resolves.toBe('encoded')
  })

  it('encodes again when the original bytes change', async () => {
    const dirs = await makeDirs()
    root = dirs.root
    const original = path.join(dirs.imagesDir, 'card.jpg')
    await writeFile(original, 'jpg')
    const encode = vi.fn(async () => Buffer.from('first'))

    await writeProductionVariants({
      imagesDir: dirs.imagesDir,
      outImagesDir: dirs.outImagesDir,
      cacheDir: dirs.cacheDir,
      encode
    })

    await writeFile(original, 'jpg-changed')
    encode.mockImplementation(async () => Buffer.from('second'))

    const result = await writeProductionVariants({
      imagesDir: dirs.imagesDir,
      outImagesDir: dirs.outImagesDir,
      cacheDir: dirs.cacheDir,
      encode
    })

    expect(result.generated).toBe(variantWidthsFor().length * IMAGE_FORMATS.length)
    expect(result.reused).toBe(0)
    await expect(readFile(path.join(dirs.outImagesDir, 'card-w400.avif'), 'utf8')).resolves.toBe('second')
  })
})
