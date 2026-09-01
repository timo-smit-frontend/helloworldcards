import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { mediaVariantKey } from '../app/services/responsiveImage'
import { memoryR2 } from '../worker/cms/media'
import { encodeMediaVariants, putMediaVariants, seedMediaWithVariants } from '../vite/media-variants'

async function makeSeedFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'hwc-media-'))
  const seedDir = path.join(root, 'seed/media')
  await mkdir(seedDir, { recursive: true })
  const jpeg = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: { r: 180, g: 40, b: 40 } }
  })
    .jpeg()
    .toBuffer()
  await writeFile(path.join(seedDir, 'hero.jpg'), jpeg)
  return { root, seedDir, jpeg }
}

describe('media variants', () => {
  let root = ''

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('encodes width variants for a seed image', async () => {
    const fixture = await makeSeedFixture()
    root = fixture.root
    const variants = await encodeMediaVariants(path.join(fixture.seedDir, 'hero.jpg'), 'hero.jpg')
    expect(variants.get('hero-w400.webp')?.byteLength).toBeGreaterThan(0)
    expect(variants.get('hero-w800.avif')?.byteLength).toBeGreaterThan(0)
  })

  it('stores variants in the media bucket under variant keys', async () => {
    const fixture = await makeSeedFixture()
    root = fixture.root
    const bucket = memoryR2()
    await bucket.put('hero.jpg', fixture.jpeg, { httpMetadata: { contentType: 'image/jpeg' } })
    const uploaded = await putMediaVariants(bucket, path.join(fixture.seedDir, 'hero.jpg'), 'hero.jpg', false)
    expect(uploaded).toBeGreaterThan(0)
    expect(await bucket.get(mediaVariantKey('hero.jpg', 800, 'webp'))).not.toBeNull()
  })

  it('seeds originals and variants together', async () => {
    const fixture = await makeSeedFixture()
    root = fixture.root
    const bucket = memoryR2()
    await seedMediaWithVariants(bucket, fixture.seedDir, [{ key: 'hero.jpg', filename: 'hero.jpg', contentType: 'image/jpeg' }])
    expect(await bucket.get('hero.jpg')).not.toBeNull()
    expect(await bucket.get('hero-w400.webp')).not.toBeNull()
  })
})

describe('handleMediaPublic variants', () => {
  it('serves pre-generated variants from the bucket', async () => {
    const { handleMediaPublic } = await import('../worker/cms/media')
    const bucket = memoryR2()
    const body = Buffer.from('webp-bytes')
    await bucket.put('hero-w800.webp', body, { httpMetadata: { contentType: 'image/webp' } })

    const response = await handleMediaPublic(new Request('https://helloworldcards.com/media/hero-w800.webp'), {}, { media: bucket })
    expect(response?.status).toBe(200)
    expect(response?.headers.get('Content-Type')).toBe('image/webp')
    await expect(response!.arrayBuffer()).resolves.toHaveProperty('byteLength', body.byteLength)
  })
})
