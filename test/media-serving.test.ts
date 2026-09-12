import { describe, expect, it, vi } from 'vitest'
import { allMediaVariantKeys } from '../app/services/responsiveImage'
import { handleAdminRequest } from '../worker/cms/admin-api'
import type { CmsDb } from '../worker/cms/db'
import { handleMediaPublic, mediaCandidates, memoryR2 } from '../worker/cms/media'
import { getR2Usage } from '../worker/cms/r2-usage'
import { SESSION_COOKIE } from '../worker/session'
import { createMemoryD1 } from './helpers/memory-d1'

const env = {
  DASHBOARD_USERNAME: 'sam',
  DASHBOARD_PASSWORD: 'correct-horse',
  DASHBOARD_SESSION_SECRET: 'session-secret-for-tests'
}
const ADMIN = 'https://admin.helloworldcards.com'
const SITE = 'https://helloworldcards.com'

async function signIn(db: CmsDb): Promise<string> {
  const login = await handleAdminRequest(
    new Request(`${ADMIN}/api/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
    }),
    env,
    { db }
  )
  return (login!.headers.get('Set-Cookie') ?? '').match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1] ?? ''
}

describe('media candidates', () => {
  it('tries the exact key, then the same-width WebP for an AVIF, then smaller WebPs, then originals', () => {
    expect(mediaCandidates('hero-w1000.avif')).toEqual([
      'hero-w1000.avif',
      'hero-w1000.webp',
      'hero-w800.webp',
      'hero-w600.webp',
      'hero-w400.webp',
      'hero.jpg',
      'hero.jpeg',
      'hero.png',
      'hero.webp'
    ])
    expect(mediaCandidates('hero-w400.webp')).toEqual(['hero-w400.webp', 'hero.jpg', 'hero.jpeg', 'hero.png', 'hero.webp'])
    expect(mediaCandidates('hero.jpg')).toEqual(['hero.jpg'])
    expect(mediaCandidates('logo.svg')).toEqual(['logo.svg'])
  })
})

describe('serving media', () => {
  it('streams the object with its size and an ETag, and answers a matching If-None-Match with 304', async () => {
    const bucket = memoryR2()
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    await bucket.put('card.jpg', bytes, { httpMetadata: { contentType: 'image/jpeg' } })

    const first = await handleMediaPublic(new Request(`${SITE}/media/card.jpg`), {}, { media: bucket })
    expect(first?.status).toBe(200)
    expect(first?.headers.get('Content-Length')).toBe('5')
    expect(first?.headers.get('Cache-Control')).toBe('public, immutable, max-age=31536000, s-maxage=604800')
    expect(first?.headers.get('Cache-Tag')).toBe('media,media-card')
    const etag = first?.headers.get('ETag')
    expect(etag).toMatch(/^".+"$/)
    expect(new Uint8Array(await first!.arrayBuffer())).toEqual(bytes)

    const again = await handleMediaPublic(
      new Request(`${SITE}/media/card.jpg`, { headers: { 'If-None-Match': etag! } }),
      {},
      { media: bucket }
    )
    expect(again?.status).toBe(304)
    expect(again?.body).toBeNull()
    expect(again?.headers.get('ETag')).toBe(etag)
    expect(again?.headers.get('Cache-Control')).toBe('public, immutable, max-age=31536000, s-maxage=604800')

    const weak = await handleMediaPublic(
      new Request(`${SITE}/media/card.jpg`, { headers: { 'If-None-Match': `W/${etag}` } }),
      {},
      { media: bucket }
    )
    expect(weak?.status).toBe(304)

    const other = await handleMediaPublic(
      new Request(`${SITE}/media/card.jpg`, { headers: { 'If-None-Match': '"nope"' } }),
      {},
      { media: bucket }
    )
    expect(other?.status).toBe(200)
  })

  it('answers HEAD from the object metadata without a body', async () => {
    const bucket = memoryR2()
    await bucket.put('card.jpg', new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/jpeg' } })
    const get = vi.spyOn(bucket, 'get')

    const head = await handleMediaPublic(new Request(`${SITE}/media/card.jpg`, { method: 'HEAD' }), {}, { media: bucket })
    expect(head?.status).toBe(200)
    expect(head?.body).toBeNull()
    expect(head?.headers.get('Content-Type')).toBe('image/jpeg')
    expect(head?.headers.get('Content-Length')).toBe('3')
    expect(head?.headers.get('ETag')).toBeTruthy()
    expect(get).not.toHaveBeenCalled()
  })

  it('serves the largest smaller WebP instead of the original while a size is missing, and only caches it briefly', async () => {
    const bucket = memoryR2()
    const original = new Uint8Array(200).fill(7)
    const small = new Uint8Array([1, 2])
    await bucket.put('card.jpg', original, { httpMetadata: { contentType: 'image/jpeg' } })
    await bucket.put('card-w600.webp', small, { httpMetadata: { contentType: 'image/webp' } })

    const wide = await handleMediaPublic(new Request(`${SITE}/media/card-w1600.avif`), {}, { media: bucket })
    expect(wide?.status).toBe(200)
    expect(wide?.headers.get('X-Media-Served-Key')).toBe('card-w600.webp')
    expect(wide?.headers.get('Content-Type')).toBe('image/webp')
    expect(wide?.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=600')
    expect(wide?.headers.get('Cache-Tag')).toBe('media,media-card')
    expect(new Uint8Array(await wide!.arrayBuffer())).toEqual(small)

    const exact = await handleMediaPublic(new Request(`${SITE}/media/card-w600.webp`), {}, { media: bucket })
    expect(exact?.headers.get('X-Media-Served-Key')).toBe('card-w600.webp')
    expect(exact?.headers.get('Cache-Control')).toBe('public, immutable, max-age=31536000, s-maxage=604800')

    const smallest = await handleMediaPublic(new Request(`${SITE}/media/card-w400.webp`), {}, { media: bucket })
    expect(smallest?.headers.get('X-Media-Served-Key')).toBe('card.jpg')
    expect(smallest?.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=600')
  })

  it('counts every bucket lookup a request needed, off the request path', async () => {
    const db = createMemoryD1()
    const bucket = memoryR2()
    await bucket.put('card.jpg', new Uint8Array([1]), { httpMetadata: { contentType: 'image/jpeg' } })
    const background: Promise<unknown>[] = []
    const ctx = { waitUntil: (promise: Promise<unknown>) => void background.push(promise) }

    // w800 → w600 → w400 → card.jpg: four lookups.
    const response = await handleMediaPublic(new Request(`${SITE}/media/card-w800.webp`), {}, { db, media: bucket, ctx })
    expect(response?.status).toBe(200)
    expect(background.length).toBeGreaterThan(0)
    await Promise.all(background)
    expect((await getR2Usage(db)).classB).toBe(4)

    // A miss on every candidate is counted too.
    background.length = 0
    const missing = await handleMediaPublic(new Request(`${SITE}/media/nothing.png`), {}, { db, media: bucket, ctx })
    expect(missing?.status).toBe(404)
    await Promise.all(background)
    expect((await getR2Usage(db)).classB).toBe(5)
  })

  it('stores the cache copy in the background when the runtime allows it', async () => {
    const bucket = memoryR2()
    await bucket.put('card.jpg', new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/jpeg' } })
    const stored: Array<{ url: string; response: Response }> = []
    const background: Promise<unknown>[] = []
    const mediaCache = {
      async match() {
        return undefined
      },
      async put(request: Request, response: Response) {
        stored.push({ url: request.url, response })
      }
    }

    const response = await handleMediaPublic(
      new Request(`${SITE}/media/card.jpg`),
      {},
      { media: bucket, mediaCache, ctx: { waitUntil: (promise) => void background.push(promise) } }
    )
    expect(response?.status).toBe(200)
    await Promise.all(background)
    expect(stored).toHaveLength(1)
    expect(stored[0].url).toBe(`${SITE}/media/card.jpg`)
    expect(new Uint8Array(await stored[0].response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('answers a conditional request from the edge cache without touching the bucket', async () => {
    const bucket = memoryR2()
    const get = vi.spyOn(bucket, 'get')
    const cached = new Response(new Uint8Array([1]), {
      headers: { 'Content-Type': 'image/jpeg', ETag: '"abc"', 'Cache-Control': 'public, immutable, max-age=31536000, s-maxage=604800' }
    })
    const mediaCache = {
      async match() {
        return cached.clone()
      },
      async put() {}
    }

    const response = await handleMediaPublic(
      new Request(`${SITE}/media/card.jpg`, { headers: { 'If-None-Match': '"abc"' } }),
      {},
      { media: bucket, mediaCache }
    )
    expect(response?.status).toBe(304)
    expect(get).not.toHaveBeenCalled()
  })
})

describe('changing media', () => {
  it('stores an upload and its resizes together and reports usage in the same answer', async () => {
    const db = createMemoryD1()
    const bucket = memoryR2()
    const token = await signIn(db)
    const form = new FormData()
    form.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'card.png', { type: 'image/png' }))
    form.append('variant', new File([new Uint8Array([1, 2, 3])], 'w400.webp', { type: 'image/webp' }))
    form.append('variant', new File([new Uint8Array([4, 5])], 'w800.webp', { type: 'image/webp' }))

    const uploaded = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}` }, body: form }),
      env,
      { db, media: bucket }
    )
    expect(uploaded?.status).toBe(201)
    const body = (await uploaded!.json()) as { media: { key: string }; r2: { classA: number; storageBytes: number } }
    expect(body.r2.classA).toBe(3)
    expect(body.r2.storageBytes).toBeGreaterThan(0)
    expect(await bucket.head?.(body.media.key.replace(/\.png$/, '-w400.webp'))).not.toBeNull()
    expect(await bucket.head?.(body.media.key.replace(/\.png$/, '-w800.webp'))).not.toBeNull()
  })

  it('removes the original and every size with one bucket call and one purge', async () => {
    const db = createMemoryD1()
    const bucket = memoryR2()
    const token = await signIn(db)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db, media: bucket }
    )
    const { media } = (await listed!.json()) as { media: Array<{ id: number; key: string }> }
    const hero = media.find((item) => item.key === 'hero.jpg')!
    await bucket.put('hero.jpg', new Uint8Array([1]), { httpMetadata: { contentType: 'image/jpeg' } })
    await bucket.put('hero-w400.webp', new Uint8Array([2]), { httpMetadata: { contentType: 'image/webp' } })

    const deletes = vi.spyOn(bucket, 'delete')
    const purges: string[][] = []

    const removed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media/${hero.id}`, { method: 'DELETE', headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db, media: bucket, purgeMediaCache: async (paths) => void purges.push(paths) }
    )
    expect(removed?.status).toBe(200)

    const expectedKeys = ['hero.jpg', ...allMediaVariantKeys('hero.jpg')]
    expect(deletes).toHaveBeenCalledTimes(1)
    expect([...(deletes.mock.calls[0][0] as string[])].sort()).toEqual([...expectedKeys].sort())
    expect(purges).toHaveLength(1)
    expect([...purges[0]].sort()).toEqual(expectedKeys.map((key) => `/media/${key}`).sort())
    expect(await bucket.head?.('hero.jpg')).toBeNull()
    expect(await bucket.head?.('hero-w400.webp')).toBeNull()

    const gone = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media/${hero.id}`, { method: 'DELETE', headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db, media: bucket }
    )
    expect(gone?.status).toBe(404)
  })
})
