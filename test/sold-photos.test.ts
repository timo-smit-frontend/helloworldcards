import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import prettier from 'prettier'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { allMediaVariantKeys } from '../app/services/responsiveImage'
import {
  SOLD_MEDIA_FOLDER,
  SOLD_PHOTO_WIDTH,
  certOfSlabPhotoKey,
  isSoldPhoto,
  mediaKeyOf,
  soldPhotoName,
  soldPhotoPlan
} from '../app/services/sold-photos'
import { getProductById, keepSoldPhoto, listMedia, listMediaFolders, updateProduct, type CmsDb } from '../worker/cms/db'
import { parseMediaSnapshot, pushMediaLibrary } from '../worker/cms/media-library-sync'
import { memoryR2, type MediaBucket } from '../worker/cms/media'
import { ensureSeeded } from '../worker/cms/seed'
import { formatSeedMediaSource, readSeedMediaDir } from '../vite/seed-media-source'
import { archiveSoldPhotos } from '../vite/sold-photos'
import { PIKACHU_FULL, withFullPhotos } from './helpers/full-photos'
import { createMemoryD1 } from './helpers/memory-d1'

const PIKACHU = 14
const PIKACHU_FRONT = 'mu00djsz-122301454-front.jpg'
const PIKACHU_BACK = 'mu00dp1r-122301454-back.jpg'
const PIKACHU_KEPT = 'mu00djsz-122301454-front-sold.webp'
const MEWTWO = 1
const MEWTWO_FRONT = '148651617_front.jpg'
const MEWTWO_BACK = '148651617_back.jpg'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

/** A slab-shaped photo, larger than the kept size so the resize has something to do. */
function photo(width = 1200, height = 1800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3a6' } })
    .jpeg()
    .toBuffer()
}

/**
 * The local database as the dev server has it — the seed products and the whole committed
 * media library — with the sold Pikachu still carrying both full-size slab photos.
 */
async function seededCms(): Promise<{ db: CmsDb; media: MediaBucket }> {
  const db = createMemoryD1()
  await ensureSeeded(db)
  await pushMediaLibrary(db, parseMediaSnapshot(await fs.readFile(path.join(process.cwd(), 'seed/cms-media.json'), 'utf8')))
  await withFullPhotos(db, PIKACHU_FULL)
  return { db, media: memoryR2() }
}

/** A repo root with only what the archive touches on disk. */
async function emptyRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-sold-test-'))
  temporaryRoots.push(root)
  await fs.writeFile(
    path.join(root, '.prettierrc'),
    JSON.stringify({ semi: false, singleQuote: true, printWidth: 140, trailingComma: 'none' })
  )
  return root
}

async function putOriginal(media: MediaBucket, key: string, bytes: Buffer): Promise<void> {
  await media.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } })
  // A couple of the resizes the sync would have made, to see them go with the original.
  for (const variant of allMediaVariantKeys(key).slice(0, 3)) {
    await media.put(variant, bytes, { httpMetadata: { contentType: 'image/webp' } })
  }
}

async function has(media: MediaBucket, key: string): Promise<boolean> {
  return (await media.head!(key)) != null
}

async function markSold(db: CmsDb, id: number): Promise<void> {
  const product = (await getProductById(db, id))!
  await updateProduct(db, id, {
    ...product,
    sold: true,
    reserved: undefined,
    marktplaatsUrl: undefined,
    vintedUrl: undefined,
    soldAt: '2026-09-20'
  })
}

describe('what a sold card keeps', () => {
  it('names the kept photo after the front original', () => {
    expect(soldPhotoName(PIKACHU_FRONT)).toBe(PIKACHU_KEPT)
    expect(soldPhotoName(MEWTWO_FRONT)).toBe('148651617_front-sold.webp')
    expect(soldPhotoName('122301454_front.jpg')).toBe('122301454_front-sold.webp')
    expect(isSoldPhoto(PIKACHU_KEPT)).toBe(true)
    expect(isSoldPhoto(`/media/${PIKACHU_KEPT}`)).toBe(true)
    expect(isSoldPhoto(PIKACHU_FRONT)).toBe(false)
  })

  it('keeps the size to the smallest the site builds, which is all the dashboard asks for', () => {
    expect(SOLD_PHOTO_WIDTH).toBe(400)
  })

  it('plans to shrink the front and drop the rest of a sold card', () => {
    expect(soldPhotoPlan({ sold: true, images: [`/media/${PIKACHU_FRONT}`, `/media/${PIKACHU_BACK}`] })).toEqual({
      shrink: PIKACHU_FRONT,
      drop: [PIKACHU_BACK]
    })
    expect(soldPhotoPlan({ sold: true, images: [`/media/${PIKACHU_FRONT}`] })).toEqual({ shrink: PIKACHU_FRONT, drop: [] })
  })

  it('plans nothing for a card that is not sold, has no photos, or already keeps just the one', () => {
    expect(soldPhotoPlan({ images: [`/media/${PIKACHU_FRONT}`, `/media/${PIKACHU_BACK}`] })).toBeNull()
    expect(soldPhotoPlan({ sold: false, images: [`/media/${PIKACHU_FRONT}`] })).toBeNull()
    expect(soldPhotoPlan({ sold: true, images: [] })).toBeNull()
    expect(soldPhotoPlan({ sold: true })).toBeNull()
    expect(soldPhotoPlan({ sold: true, images: [`/media/${PIKACHU_KEPT}`] })).toBeNull()
  })

  it('only drops the extras when the kept photo is already in front', () => {
    expect(soldPhotoPlan({ sold: true, images: [`/media/${PIKACHU_KEPT}`, `/media/${PIKACHU_BACK}`] })).toEqual({
      shrink: null,
      drop: [PIKACHU_BACK]
    })
  })

  it('reads the cert off a slab photo key, however the photo was named', () => {
    expect(certOfSlabPhotoKey(PIKACHU_FRONT)).toBe('122301454')
    expect(certOfSlabPhotoKey(PIKACHU_KEPT)).toBe('122301454')
    expect(certOfSlabPhotoKey(MEWTWO_FRONT)).toBe('148651617')
    expect(certOfSlabPhotoKey('148651617_front-sold.webp')).toBe('148651617')
    expect(certOfSlabPhotoKey('mu86wg61-54094139-front.jpeg')).toBe('54094139')
    expect(certOfSlabPhotoKey(PIKACHU_BACK)).toBeNull()
    expect(certOfSlabPhotoKey('hero.jpg')).toBeNull()
  })

  it('takes the bucket key off a media URL and nothing else', () => {
    expect(mediaKeyOf(`/media/${PIKACHU_FRONT}`)).toBe(PIKACHU_FRONT)
    expect(mediaKeyOf('https://elsewhere.example/photo.jpg')).toBeNull()
  })
})

describe('archiving the photos of sold cards', () => {
  it('keeps one small front photo of a sold card, filed under Sold, and drops the rest', async () => {
    const { db, media } = await seededCms()
    const root = await emptyRoot()
    await putOriginal(media, PIKACHU_FRONT, await photo())
    await putOriginal(media, PIKACHU_BACK, await photo())
    const before = (await getProductById(db, PIKACHU))!
    const lines: string[] = []

    const result = await archiveSoldPhotos({ root, db, media, log: (line) => lines.push(line) })

    expect(result.archived).toEqual([{ id: PIKACHU, title: 'Pikachu' }])
    expect(result.skipped).toEqual([])

    const after = (await getProductById(db, PIKACHU))!
    expect(after.images).toEqual([`/media/${PIKACHU_KEPT}`])
    // The sale itself stays on the books in full.
    expect({ ...after, images: before.images }).toEqual(before)

    const library = await listMedia(db)
    const folders = await listMediaFolders(db)
    const kept = library.find((item) => item.key === PIKACHU_KEPT)!
    expect(kept).toMatchObject({
      filename: '122301454_front-sold.webp',
      contentType: 'image/webp',
      width: 400,
      height: 600,
      title: 'Pikachu, front',
      alt: 'The front of the Pikachu slab.'
    })
    expect(kept.bytes).toBeGreaterThan(0)
    expect(folders.find((folder) => folder.id === kept.folderId)?.name).toBe(SOLD_MEDIA_FOLDER)
    expect(library.some((item) => item.key === PIKACHU_FRONT || item.key === PIKACHU_BACK)).toBe(false)

    // The bucket holds the kept photo with its resizes, and nothing of the originals.
    expect(await has(media, PIKACHU_KEPT)).toBe(true)
    for (const variant of allMediaVariantKeys(PIKACHU_KEPT)) {
      expect(await has(media, variant)).toBe(true)
    }
    const object = await media.get(PIKACHU_KEPT)
    const { width, height, format } = await sharp(Buffer.from(await object!.arrayBuffer())).metadata()
    expect({ width, height, format }).toEqual({ width: 400, height: 600, format: 'webp' })
    for (const key of [PIKACHU_FRONT, PIKACHU_BACK]) {
      expect(await has(media, key)).toBe(false)
      for (const variant of allMediaVariantKeys(key)) {
        expect(await has(media, variant)).toBe(false)
      }
    }

    // The push to production reads uploads from the sync's cache, so the photo is put there too.
    await expect(fs.access(path.join(root, '.cache/media-originals', PIKACHU_KEPT))).resolves.toBeUndefined()
    expect(lines).toEqual([`Pikachu is sold: kept 400 px ${PIKACHU_KEPT}; dropped ${PIKACHU_FRONT}, ${PIKACHU_BACK}`])
  })

  it('leaves every card that is not sold alone, and does nothing the second time', async () => {
    const { db, media } = await seededCms()
    const root = await emptyRoot()
    await putOriginal(media, PIKACHU_FRONT, await photo())
    await putOriginal(media, PIKACHU_BACK, await photo())
    await putOriginal(media, MEWTWO_FRONT, await photo())
    const others = (await Promise.all([1, 2, 3, 16].map((id) => getProductById(db, id)))).map((product) => product!.images)

    await archiveSoldPhotos({ root, db, media })
    const again = await archiveSoldPhotos({ root, db, media })

    expect(again).toEqual({ archived: [], skipped: [] })
    expect((await Promise.all([1, 2, 3, 16].map((id) => getProductById(db, id)))).map((product) => product!.images)).toEqual(others)
    expect(await has(media, MEWTWO_FRONT)).toBe(true)
    expect((await listMedia(db)).some((item) => item.key === MEWTWO_FRONT)).toBe(true)
  })

  it('skips a sold card whose front photo cannot be read anywhere, and says which', async () => {
    const { db, media } = await seededCms()
    const root = await emptyRoot()
    const before = (await getProductById(db, PIKACHU))!

    const result = await archiveSoldPhotos({ root, db, media, readOriginal: async () => null })

    expect(result).toEqual({ archived: [], skipped: [{ id: PIKACHU, title: 'Pikachu', key: PIKACHU_FRONT }] })
    expect(await getProductById(db, PIKACHU)).toEqual(before)
    expect((await listMedia(db)).some((item) => item.key === PIKACHU_FRONT)).toBe(true)
  })

  it('reads an original the bucket has lost from wherever the sync keeps uploads', async () => {
    const { db, media } = await seededCms()
    const root = await emptyRoot()
    const bytes = await photo()

    const result = await archiveSoldPhotos({ root, db, media, readOriginal: async (key) => (key === PIKACHU_FRONT ? bytes : null) })

    expect(result.archived).toEqual([{ id: PIKACHU, title: 'Pikachu' }])
    expect((await getProductById(db, PIKACHU))!.images).toEqual([`/media/${PIKACHU_KEPT}`])
    expect(await has(media, PIKACHU_KEPT)).toBe(true)
  })

  it('reads a committed original from seed/media, removes it, and rewrites app/cms/seed-media.ts', async () => {
    const { db, media } = await seededCms()
    const root = await emptyRoot()
    await fs.mkdir(path.join(root, 'seed/media'), { recursive: true })
    await fs.mkdir(path.join(root, 'app/cms'), { recursive: true })
    await fs.writeFile(path.join(root, 'seed/media', MEWTWO_FRONT), await photo())
    await fs.writeFile(path.join(root, 'seed/media', MEWTWO_BACK), await photo())
    await fs.writeFile(path.join(root, 'seed/media', 'hero.jpg'), await photo(300, 200))
    await fs.writeFile(path.join(root, 'app/cms/seed-media.ts'), 'stale')
    await markSold(db, MEWTWO)
    const lines: string[] = []

    const result = await archiveSoldPhotos({ root, db, media, readOriginal: async () => null, log: (line) => lines.push(line) })

    expect(result.archived.map((item) => item.id)).toEqual([MEWTWO, PIKACHU].filter((id) => id === MEWTWO))
    expect(result.skipped.map((item) => item.id)).toEqual([PIKACHU])
    expect((await getProductById(db, MEWTWO))!.images).toEqual(['/media/148651617_front-sold.webp'])
    const kept = (await listMedia(db)).find((item) => item.key === '148651617_front-sold.webp')!
    expect(kept).toMatchObject({ filename: '148651617_front-sold.webp', title: 'Mewtwo, front' })

    await expect(fs.readdir(path.join(root, 'seed/media'))).resolves.toEqual(['hero.jpg'])
    const source = path.join(root, 'app/cms/seed-media.ts')
    const expected = formatSeedMediaSource(await readSeedMediaDir(path.join(root, 'seed/media')))
    expect(await fs.readFile(source, 'utf8')).toBe(
      await prettier.format(expected, { ...(await prettier.resolveConfig(source)), filepath: source })
    )
    expect(await fs.readFile(source, 'utf8')).toContain("key: 'hero.jpg'")
    expect(await fs.readFile(source, 'utf8')).not.toContain('148651617')
    expect(lines[0]).toContain(`removed seed/media/${MEWTWO_FRONT}; removed seed/media/${MEWTWO_BACK}`)
  })

  it('removes the branded ad photo the listings led with', async () => {
    const { db, media } = await seededCms()
    const root = await emptyRoot()
    await fs.mkdir(path.join(root, 'public/ads'), { recursive: true })
    await fs.writeFile(path.join(root, 'public/ads/122301454.jpeg'), await photo(100, 100))
    await fs.writeFile(path.join(root, 'public/ads/148651617.jpeg'), await photo(100, 100))
    await putOriginal(media, PIKACHU_FRONT, await photo())
    const lines: string[] = []

    await archiveSoldPhotos({ root, db, media, log: (line) => lines.push(line) })

    await expect(fs.readdir(path.join(root, 'public/ads'))).resolves.toEqual(['148651617.jpeg'])
    expect(lines[0]).toContain('removed public/ads/122301454.jpeg')
  })

  it('drops the extra photos of a card that already keeps its small one', async () => {
    const { db, media } = await seededCms()
    const root = await emptyRoot()
    await putOriginal(media, PIKACHU_FRONT, await photo())
    await putOriginal(media, PIKACHU_BACK, await photo())
    await archiveSoldPhotos({ root, db, media })
    // Someone put the back photo on the card again after the fact.
    const product = (await getProductById(db, PIKACHU))!
    await updateProduct(db, PIKACHU, { ...product, images: [`/media/${PIKACHU_KEPT}`, `/media/${PIKACHU_BACK}`] })
    await putOriginal(media, PIKACHU_BACK, await photo())

    const result = await archiveSoldPhotos({ root, db, media })

    expect(result.archived).toEqual([{ id: PIKACHU, title: 'Pikachu' }])
    expect((await getProductById(db, PIKACHU))!.images).toEqual([`/media/${PIKACHU_KEPT}`])
    expect(await has(media, PIKACHU_BACK)).toBe(false)
    expect((await listMedia(db)).some((item) => item.key === PIKACHU_KEPT)).toBe(true)
  })

  it('finishes a run that was cut short after the kept row was written', async () => {
    const { db } = await seededCms()
    const folderId = (await listMediaFolders(db)).find((folder) => folder.name === 'Slabs')!.id
    const photoRow = {
      key: PIKACHU_KEPT,
      filename: '122301454_front-sold.webp',
      contentType: 'image/webp',
      bytes: 10,
      width: 400,
      height: 600,
      folderId
    }
    await keepSoldPhoto(db, { productId: PIKACHU, keep: PIKACHU_KEPT, replace: { front: PIKACHU_FRONT, photo: photoRow }, drop: [] })
    // The front row is back — a save from a stale admin form, say — next to the kept one.
    const product = (await getProductById(db, PIKACHU))!
    await updateProduct(db, PIKACHU, { ...product, images: [`/media/${PIKACHU_FRONT}`, `/media/${PIKACHU_BACK}`] })
    await db
      .prepare(
        "INSERT INTO media (key, filename, content_type, bytes, title, alt, created_at) VALUES (?, ?, 'image/jpeg', 1, '', '', '2026-09-01T00:00:00.000Z')"
      )
      .bind(PIKACHU_FRONT, '122301454_front.jpg')
      .run()

    await keepSoldPhoto(db, {
      productId: PIKACHU,
      keep: PIKACHU_KEPT,
      replace: { front: PIKACHU_FRONT, photo: { ...photoRow, bytes: 20 } },
      drop: [PIKACHU_BACK]
    })

    const library = await listMedia(db)
    expect(library.filter((item) => item.key === PIKACHU_KEPT)).toHaveLength(1)
    expect(library.find((item) => item.key === PIKACHU_KEPT)?.bytes).toBe(20)
    expect(library.some((item) => item.key === PIKACHU_FRONT || item.key === PIKACHU_BACK)).toBe(false)
    expect((await getProductById(db, PIKACHU))!.images).toEqual([`/media/${PIKACHU_KEPT}`])
  })
})
