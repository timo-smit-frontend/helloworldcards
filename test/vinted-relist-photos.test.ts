import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { seedMediaFiles } from '../app/cms/seed-media'
import { cachedMediaSource, firstMediaSource, seedMediaSource } from '../vite/media-originals'
import { readOriginalPhotos } from '../vite/vinted-relist'

const roots: string[] = []

async function projectRoot(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-relist-photos-'))
  roots.push(root)
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await fs.writeFile(path.join(root, file), content)
  }
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

/** A key that is in the seed, and one that is not. */
const seeded = seedMediaFiles[0]!

describe('readOriginalPhotos', () => {
  it('reads the ad from the repo and a seeded slab photo from seed/media', async () => {
    const root = await projectRoot({
      'public/ads/148651617.jpeg': 'ad',
      [`seed/media/${seeded.filename}`]: 'front'
    })
    const photos = await readOriginalPhotos(
      root,
      { ad: 'public/ads/148651617.jpeg', media: [seeded.key] },
      firstMediaSource(seedMediaSource(root), cachedMediaSource(root))
    )
    expect(photos.map(String)).toEqual(['ad', 'front'])
  })

  it('finds a slab photo uploaded through the admin in the cache of uploads, not in seed/media', async () => {
    const root = await projectRoot({
      'public/ads/155373625.jpeg': 'ad',
      '.cache/media-originals/mtpx3uh1-155373625-front.jpg': 'front',
      '.cache/media-originals/mtpx3uk6-155373625-back.jpg': 'back'
    })
    const photos = await readOriginalPhotos(
      root,
      { ad: 'public/ads/155373625.jpeg', media: ['mtpx3uh1-155373625-front.jpg', 'mtpx3uk6-155373625-back.jpg'] },
      firstMediaSource(seedMediaSource(root), cachedMediaSource(root))
    )
    expect(photos.map(String)).toEqual(['ad', 'front', 'back'])
  })

  it('asks the media library before the cache, so a fresh upload is found before any sync has run', async () => {
    const root = await projectRoot({})
    const library = async (key: string) => (key === 'mtpx3uh1-155373625-front.jpg' ? Buffer.from('from the bucket') : null)
    const photos = await readOriginalPhotos(
      root,
      { ad: null, media: ['mtpx3uh1-155373625-front.jpg'] },
      firstMediaSource(seedMediaSource(root), library, cachedMediaSource(root))
    )
    expect(photos.map(String)).toEqual(['from the bucket'])
  })

  it('names the photo it could not find and leaves the listing alone', async () => {
    const root = await projectRoot({ 'public/ads/155373625.jpeg': 'ad' })
    await expect(
      readOriginalPhotos(
        root,
        { ad: 'public/ads/155373625.jpeg', media: ['mtpx3uh1-155373625-front.jpg'] },
        firstMediaSource(seedMediaSource(root), cachedMediaSource(root))
      )
    ).rejects.toThrow('The photo mtpx3uh1-155373625-front.jpg is not in seed/media or the media library, so the listing was left alone.')
  })

  it('names a missing ad photo', async () => {
    const root = await projectRoot({})
    await expect(readOriginalPhotos(root, { ad: 'public/ads/1.jpeg', media: [] }, async () => null)).rejects.toThrow(
      'The ad photo public/ads/1.jpeg is missing, so the listing was left alone.'
    )
  })
})
