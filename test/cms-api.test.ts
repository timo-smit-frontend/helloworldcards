import { describe, expect, it } from 'vitest'
import { CMS_COMPONENT_PREVIEW_KEYS } from '../app/cms/block-previews'
import { seedMediaFiles } from '../app/cms/seed-media'
import { handleAdminRequest } from '../worker/cms/admin-api'
import { handleMediaPublic, memoryR2 } from '../worker/cms/media'
import { handleLlms, handlePublicApi, handleSitemap } from '../worker/cms/public-api'
import { handleDashboardRequest } from '../worker/dashboard-api'
import { SESSION_COOKIE } from '../worker/session'
import { createMemoryD1 } from './helpers/memory-d1'
import type { CmsDb } from '../worker/cms/db'

const env = {
  DASHBOARD_USERNAME: 'sam',
  DASHBOARD_PASSWORD: 'correct-horse',
  DASHBOARD_SESSION_SECRET: 'session-secret-for-tests'
}

const ADMIN = 'https://admin.helloworldcards.com'

function cookieFrom(response: Response): string {
  const header = response.headers.get('Set-Cookie') ?? ''
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  return match?.[1] ?? ''
}

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
  return cookieFrom(login!)
}

describe('CMS API', () => {
  it('seeds the current shop and hides purchase costs on the public payload', async () => {
    const db = createMemoryD1()
    const payload = await handlePublicApi(new Request('https://helloworldcards.com/api/public?path=/'), env, {
      db
    })

    expect(payload?.status).toBe(200)
    const body = (await payload!.json()) as {
      page: { path: string; blocks: Array<{ type: string }> }
      products: Array<Record<string, unknown>>
      notFound: boolean
    }
    expect(body.notFound).toBe(false)
    expect(body.page.path).toBe('/')
    expect(body.page.blocks.some((block) => block.type === 'banner_figcaption')).toBe(true)
    expect(body.products.length).toBeGreaterThan(0)
    expect(body.products.every((product) => (product.images as string[]).every((src) => src.startsWith('/media/')))).toBe(true)
    expect(body.products.every((product) => !('cost' in product) && !('cardmarketUrl' in product) && !('concept' in product))).toBe(true)
  })

  it('keeps draft pages off the public site', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const created = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ path: '/secret', status: 'draft', title: 'Secret', blocks: [] })
      }),
      env,
      { db }
    )
    expect(created?.status).toBe(201)

    const publicPage = await handlePublicApi(new Request('https://helloworldcards.com/api/public?path=/secret'), env, {
      db
    })
    const body = (await publicPage!.json()) as { notFound: boolean; page: unknown }
    expect(body.notFound).toBe(true)
    expect(body.page).toBeNull()
  })

  it('rejects reserved product-detail paths', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const created = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ path: '/products/mewtwo-2016-evolutions-51', status: 'published', title: 'Nope', blocks: [] })
      }),
      env,
      { db }
    )
    expect(created?.status).toBe(400)
  })

  it('omits sold cards from the public shop list', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const products = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const list = (await products!.json()) as { products: Array<{ id: number; title: string }> }
    const mewtwo = list.products.find((product) => product.title === 'Mewtwo')!

    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ ...mewtwo, sold: true, soldAt: '2026-09-01', price: '€90' })
      }),
      env,
      { db }
    )

    const payload = await handlePublicApi(new Request('https://helloworldcards.com/api/public?path=/products'), env, {
      db
    })
    const body = (await payload!.json()) as { products: Array<{ title: string }> }
    expect(body.products.some((product) => product.title === 'Mewtwo')).toBe(false)
  })

  it('accepts a euro-formatted purchase cost', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const products = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const list = (await products!.json()) as { products: Array<{ id: number; title: string; cost?: number }> }
    const mewtwo = list.products.find((product) => product.title === 'Mewtwo')!

    const updated = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ ...mewtwo, cost: '€40' })
      }),
      env,
      { db }
    )
    const body = (await updated!.json()) as { product: { cost?: number } }
    expect(body.product.cost).toBe(40)
  })

  it('resolves a random product block on the published home page', async () => {
    const db = createMemoryD1()
    const payload = await handlePublicApi(new Request('https://helloworldcards.com/api/public?path=/'), env, {
      db
    })
    const body = (await payload!.json()) as {
      page: { blocks: Array<{ type: string; random?: boolean; productIds?: number[] }> }
    }
    const block = body.page.blocks.find((item) => item.type === 'content_products')
    expect(block?.random).toBe(true)
    expect(block?.productIds).toBeUndefined()
  })

  it('stores uploads and serves them from /media/:key', async () => {
    const db = createMemoryD1()
    const media = memoryR2()
    const token = await signIn(db as unknown as CmsDb)
    const form = new FormData()
    form.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'card.png', { type: 'image/png' }))

    const uploaded = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
        body: form
      }),
      env,
      { db, media }
    )
    expect(uploaded?.status).toBe(201)
    const body = (await uploaded!.json()) as { media: { key: string; url: string } }
    expect(body.media.url).toMatch(/^\/media\//)

    const served = await handleMediaPublic(new Request(`https://helloworldcards.com${body.media.url}`), env, { db, media })
    expect(served?.status).toBe(200)
    expect(served?.headers.get('Content-Type')).toBe('image/png')
    expect(served?.headers.get('Cache-Control')).toBe('public, immutable, max-age=31536000, s-maxage=604800')

    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      {
        db,
        media
      }
    )
    const usage = (await listed!.json()) as { r2: { classA: number; classB: number; storageBytes: number; warnings: unknown[] } }
    expect(usage.r2.classA).toBe(1)
    expect(usage.r2.classB).toBe(1)
    expect(usage.r2.storageBytes).toBe(4 + seedMediaFiles.reduce((sum, file) => sum + file.bytes, 0))
    expect(usage.r2.warnings).toEqual([])
  })

  it('stores the resized copies sent with an upload and serves them for AVIF too', async () => {
    const db = createMemoryD1()
    const media = memoryR2()
    const token = await signIn(db as unknown as CmsDb)
    const form = new FormData()
    form.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'card.png', { type: 'image/png' }))
    form.append('variant', new File([new Uint8Array([1, 2, 3])], 'w400.webp', { type: 'image/webp' }))
    form.append('variant', new File([new Uint8Array([4])], 'w123.webp', { type: 'image/webp' }))

    const uploaded = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
        body: form
      }),
      env,
      { db, media }
    )
    const body = (await uploaded!.json()) as { media: { key: string; url: string } }
    const stem = body.media.url.replace(/\.png$/, '')

    const webp = await handleMediaPublic(new Request(`https://helloworldcards.com${stem}-w400.webp`), env, { db, media })
    expect(webp?.headers.get('Content-Type')).toBe('image/webp')
    expect(webp?.headers.get('X-Media-Served-Key')).toBe(`${body.media.key.replace(/\.png$/, '')}-w400.webp`)

    // Canvas cannot encode AVIF, so the WebP of the same width stands in for it.
    const avif = await handleMediaPublic(new Request(`https://helloworldcards.com${stem}-w400.avif`), env, { db, media })
    expect(avif?.headers.get('Content-Type')).toBe('image/webp')
    expect(new Uint8Array(await avif!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    // A width the build never makes is ignored, so the original answers instead.
    const unknown = await handleMediaPublic(new Request(`https://helloworldcards.com${stem}-w123.webp`), env, { db, media })
    expect(unknown?.headers.get('Content-Type')).toBe('image/png')
  })

  it('catalogues the shop photos in the media library', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      {
        db,
        media: memoryR2()
      }
    )
    const body = (await listed!.json()) as { media: Array<{ key: string; url: string; title: string; alt: string }> }
    expect(body.media.some((item) => item.key === 'hero.jpg' && item.url === '/media/hero.jpg')).toBe(true)
    expect(body.media.some((item) => item.key === '76719295_front.jpg')).toBe(true)
    expect(body.media).toHaveLength(seedMediaFiles.length)
    expect(body.media.slice(-CMS_COMPONENT_PREVIEW_KEYS.length).map((item) => item.key)).toEqual([...CMS_COMPONENT_PREVIEW_KEYS])
    const hero = body.media.find((item) => item.key === 'hero.jpg')
    expect(hero?.title).toBe('Pokémon tournament with a giant Pikachu balloon')
    expect(hero?.alt).toContain('Pikachu balloon')
  })

  it('lets admin update media title and alt', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      {
        db,
        media: memoryR2()
      }
    )
    const body = (await listed!.json()) as { media: Array<{ id: number; key: string }> }
    const hero = body.media.find((item) => item.key === 'hero.jpg')!

    const updated = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media/${hero.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ title: 'Tournament hall', alt: 'A packed card hall with a Pikachu balloon.' })
      }),
      env,
      { db, media: memoryR2() }
    )
    expect(updated?.status).toBe(200)
    const saved = (await updated!.json()) as { media: { title: string; alt: string; url: string } }
    expect(saved.media.title).toBe('Tournament hall')
    expect(saved.media.alt).toBe('A packed card hall with a Pikachu balloon.')

    const payload = await handlePublicApi(new Request('https://helloworldcards.com/api/public?path=/'), env, { db })
    const publicBody = (await payload!.json()) as { mediaCopy: Record<string, { title: string; alt: string }> }
    expect(publicBody.mediaCopy['/media/hero.jpg']).toEqual({
      title: 'Tournament hall',
      alt: 'A packed card hall with a Pikachu balloon.'
    })
  })

  it('replaces a media file and repoints every reference to the new URL', async () => {
    const db = createMemoryD1()
    const media = memoryR2()
    const token = await signIn(db as unknown as CmsDb)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db, media }
    )
    const body = (await listed!.json()) as { media: Array<{ id: number; key: string; url: string }> }
    const hero = body.media.find((item) => item.key === 'hero.jpg')!

    const variantKey = 'hero-w400.webp'
    await media.put(variantKey, new Uint8Array([1, 2]), { httpMetadata: { contentType: 'image/webp' } })
    await db
      .prepare("UPDATE pages SET blocks = ? WHERE path = '/'")
      .bind(JSON.stringify([{ type: 'banner_figcaption', image: hero.url }]))
      .run()

    const purged: string[] = []
    const form = new FormData()
    form.append('file', new File([new Uint8Array([255, 216, 255, 224, 0])], 'other.jpg', { type: 'image/jpeg' }))
    const replaced = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media/${hero.id}/file`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
        body: form
      }),
      env,
      { db, media, purgeMediaCache: async (path: string) => void purged.push(path) }
    )
    expect(replaced?.status).toBe(200)
    const saved = (await replaced!.json()) as {
      media: { id: number; key: string; url: string; filename: string; contentType: string; bytes: number }
    }
    expect(saved.media.id).toBe(hero.id)
    expect(saved.media.key).not.toBe(hero.key)
    expect(saved.media.url).toBe(`/media/${saved.media.key}`)
    expect(saved.media.filename).toBe('other.jpg')
    expect(saved.media.contentType).toBe('image/jpeg')
    expect(saved.media.bytes).toBe(5)

    // The old original and its variants are gone from R2 and purged from the edge.
    expect(await media.get(hero.key)).toBeNull()
    expect(await media.get(variantKey)).toBeNull()
    expect(purged).toContain(`/media/${hero.key}`)
    expect(purged).toContain(`/media/${variantKey}`)

    const page = await db.prepare("SELECT blocks FROM pages WHERE path = '/'").first<{ blocks: string }>()
    expect(page!.blocks).toContain(saved.media.url)
    expect(page!.blocks).not.toContain(hero.url)

    const served = await handleMediaPublic(new Request(`https://helloworldcards.com${saved.media.url}`), env, { db, media })
    expect(served?.status).toBe(200)
    expect(served?.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('does not count a cached media hit as an R2 Class B read', async () => {
    const db = createMemoryD1()
    const media = memoryR2()
    const token = await signIn(db as unknown as CmsDb)
    const form = new FormData()
    form.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'card.png', { type: 'image/png' }))
    const uploaded = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
        body: form
      }),
      env,
      { db, media }
    )
    const body = (await uploaded!.json()) as { media: { url: string } }
    const cached = new Response(new Uint8Array([1]), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, immutable, max-age=31536000, s-maxage=604800' }
    })
    await handleMediaPublic(new Request(`https://helloworldcards.com${body.media.url}`), env, {
      db,
      media,
      mediaCache: {
        match: async () => cached.clone(),
        put: async () => undefined
      }
    })

    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/media`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      {
        db,
        media
      }
    )
    const usage = (await listed!.json()) as { r2: { classB: number } }
    expect(usage.r2.classB).toBe(0)
  })

  it('moves a product to trash and restores it', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const { products } = (await listed!.json()) as { products: Array<{ id: number; title: string; slug: string }> }
    const mewtwo = products.find((product) => product.title === 'Mewtwo')!

    const trashed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { db }
    )
    expect(trashed?.status).toBe(200)

    const after = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const remaining = (await after!.json()) as { products: Array<{ title: string }> }
    expect(remaining.products.some((product) => product.title === 'Mewtwo')).toBe(false)

    const missing = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    expect(missing?.status).toBe(404)

    const publicPayload = await handlePublicApi(new Request('https://helloworldcards.com/api/public?path=/products'), env, { db })
    const publicBody = (await publicPayload!.json()) as { products: Array<{ title: string }> }
    expect(publicBody.products.some((product) => product.title === 'Mewtwo')).toBe(false)

    const slugPage = await handlePublicApi(new Request(`https://helloworldcards.com/api/public?path=/products/${mewtwo.slug}`), env, { db })
    const slugBody = (await slugPage!.json()) as { notFound: boolean }
    expect(slugBody.notFound).toBe(true)

    const trash = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/trash`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const trashBody = (await trash!.json()) as { products: Array<{ id: number; title: string }> }
    expect(trashBody.products).toEqual([expect.objectContaining({ id: mewtwo.id, title: 'Mewtwo' })])

    const restored = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}/restore`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { db }
    )
    expect(restored?.status).toBe(200)

    const back = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const live = (await back!.json()) as { products: Array<{ title: string }> }
    expect(live.products.some((product) => product.title === 'Mewtwo')).toBe(true)
  })

  it('hard-deletes only from trash and keeps slugs reserved until then', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const { products } = (await listed!.json()) as { products: Array<{ id: number; slug: string }> }
    const mewtwo = products.find((product) => product.slug === 'mewtwo-2016-evolutions-51')!

    const livePermanent = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}/permanent`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { db }
    )
    expect(livePermanent?.status).toBe(404)

    const liveRestore = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}/restore`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { db }
    )
    expect(liveRestore?.status).toBe(404)

    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { db }
    )

    const reuse = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ title: 'Copy', slug: mewtwo.slug })
      }),
      env,
      { db }
    )
    expect(reuse?.status).toBe(400)

    const removed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}/permanent`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { db }
    )
    expect(removed?.status).toBe(200)

    const trash = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/trash`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const trashBody = (await trash!.json()) as { products: Array<{ id: number }> }
    expect(trashBody.products.some((product) => product.id === mewtwo.id)).toBe(false)

    const created = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ title: 'Copy', slug: mewtwo.slug })
      }),
      env,
      { db }
    )
    expect(created?.status).toBe(201)
  })

  it('trashes pages, events, and faqs the same way', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const headers = { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` }

    const page = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: '/trashed-page', status: 'published', title: 'Trashed page', blocks: [] })
      }),
      env,
      { db }
    )
    const pageBody = (await page!.json()) as { page: { id: number; path: string } }

    const event = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'Trashed cup', date: '2026-12-01', location: 'Utrecht' })
      }),
      env,
      { db }
    )
    const eventBody = (await event!.json()) as { event: { id: number } }

    const faq = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/faqs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: 'Trashed question?', answer: 'Gone.' })
      }),
      env,
      { db }
    )
    const faqBody = (await faq!.json()) as { faq: { id: number } }

    for (const [collection, id] of [
      ['pages', pageBody.page.id],
      ['events', eventBody.event.id],
      ['faqs', faqBody.faq.id]
    ] as const) {
      const deleted = await handleAdminRequest(
        new Request(`${ADMIN}/api/admin/${collection}/${id}`, {
          method: 'DELETE',
          headers: { Cookie: `${SESSION_COOKIE}=${token}` }
        }),
        env,
        { db }
      )
      expect(deleted?.status).toBe(200)
    }

    const publicPage = await handlePublicApi(new Request('https://helloworldcards.com/api/public?path=/trashed-page'), env, { db })
    expect(((await publicPage!.json()) as { notFound: boolean }).notFound).toBe(true)

    const publicHome = await handlePublicApi(new Request('https://helloworldcards.com/api/public?path=/'), env, { db })
    const home = (await publicHome!.json()) as { events: Array<{ title: string }>; faqs: Array<{ question: string }> }
    expect(home.events.some((item) => item.title === 'Trashed cup')).toBe(false)
    expect(home.faqs.some((item) => item.question === 'Trashed question?')).toBe(false)

    const reusePath = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: '/trashed-page', status: 'published', title: 'New page', blocks: [] })
      }),
      env,
      { db }
    )
    expect(reusePath?.status).toBe(400)

    const pagesTrash = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/pages/trash`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    expect(((await pagesTrash!.json()) as { pages: Array<{ title: string }> }).pages.some((item) => item.title === 'Trashed page')).toBe(
      true
    )
  })

  it('keeps trashed sold products on the dashboard ledger and drops unsold trash', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const { products } = (await listed!.json()) as { products: Array<{ id: number; title: string }> }
    const mewtwo = products.find((product) => product.title === 'Mewtwo')!
    const lugia = products.find((product) => product.title === 'Lugia V')!

    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ ...mewtwo, sold: true, soldAt: '2026-09-01', price: '€90' })
      }),
      env,
      { db }
    )
    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { db }
    )
    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${lugia.id}`, {
        method: 'DELETE',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      { db }
    )

    const ledger = await handleDashboardRequest(
      new Request('https://example.com/dashboard/ledger/', { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const body = (await ledger!.json()) as { items: Array<{ title: string; sold: boolean }> }
    expect(body.items.some((item) => item.title === 'Mewtwo' && item.sold)).toBe(true)
    expect(body.items.some((item) => item.title === 'Lugia V')).toBe(false)
  })

  it('builds a sitemap from published pages and shop products', async () => {
    const db = createMemoryD1()
    const sitemap = await handleSitemap(new Request('https://helloworldcards.com/sitemap.xml'), env, {
      db
    })
    expect(sitemap?.status).toBe(200)
    const xml = await sitemap!.text()
    expect(xml).toContain('https://helloworldcards.com/')
    expect(xml).toContain('https://helloworldcards.com/products/')
    expect(xml).toContain('https://helloworldcards.com/agenda/')
    expect(xml).toContain('https://helloworldcards.com/about/')
    expect(xml).toContain('https://helloworldcards.com/contact/')
    expect(xml).toContain('https://helloworldcards.com/privacy/')
    expect(xml).toContain('/products/mewtwo-2016-evolutions-51/')
    expect(xml).not.toContain('/dashboard')
    expect(xml).not.toContain('/admin')
  })

  it('keeps draft pages and sold products out of the sitemap', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ path: '/secret', status: 'draft', title: 'Secret', blocks: [] })
      }),
      env,
      { db }
    )
    const products = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const list = (await products!.json()) as { products: Array<{ id: number; title: string }> }
    const mewtwo = list.products.find((product) => product.title === 'Mewtwo')!
    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ ...mewtwo, sold: true, soldAt: '2026-09-01', price: '€90' })
      }),
      env,
      { db }
    )

    const xml = await (await handleSitemap(new Request('https://helloworldcards.com/sitemap.xml'), env, { db }))!.text()
    expect(xml).not.toContain('/secret')
    expect(xml).not.toContain('/products/mewtwo-2016-evolutions-51/')
  })

  it('builds llms.txt from published pages, shop products, and events', async () => {
    const db = createMemoryD1()
    const llms = await handleLlms(new Request('https://helloworldcards.com/llms.txt'), env, { db })
    expect(llms?.status).toBe(200)
    expect(llms?.headers.get('Content-Type')).toContain('text/plain')
    const text = await llms!.text()
    expect(text).toContain('# Hello World Cards')
    expect(text).toContain('## Pages')
    expect(text).toContain('[Home](https://helloworldcards.com/)')
    expect(text).toContain('[Shop](https://helloworldcards.com/products/)')
    expect(text).toContain('[Upcoming events](https://helloworldcards.com/agenda/)')
    expect(text).toContain('[About](https://helloworldcards.com/about/)')
    expect(text).toContain('[Contact](https://helloworldcards.com/contact/)')
    expect(text).toContain('## Products')
    expect(text).toContain('[Mewtwo](https://helloworldcards.com/products/mewtwo-2016-evolutions-51/)')
    expect(text).toContain('## Events')
    expect(text).toContain('## Optional')
    expect(text).toContain('[Privacy statement](https://helloworldcards.com/privacy/)')
    expect(text).toContain('Sam paints custom binders')
    expect(text).not.toContain('## FAQ')
    expect(text).not.toContain('/dashboard')
  })

  it('includes FAQ answers in llms-full.txt', async () => {
    const db = createMemoryD1()
    const llms = await handleLlms(new Request('https://helloworldcards.com/llms-full.txt'), env, { db })
    const text = await llms!.text()
    expect(text).toContain('## FAQ')
    expect(text).toContain('What is Hello World Cards?')
  })
})
