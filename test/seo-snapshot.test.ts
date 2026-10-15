import { describe, expect, it } from 'vitest'
import { applyPageSnapshot, buildPageSnapshot } from '~/seo/snapshot'
import { injectCmsPayload } from '../worker/cms/html'
import { buildPublicPayload, publicPageStatus } from '../worker/cms/public'
import { ensureSeeded } from '../worker/cms/seed'
import { createMemoryD1 } from './helpers/memory-d1'

const SHELL = '<html><head><title>x</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'

async function snapshotFor(path: string, { reserved = false } = {}) {
  const db = createMemoryD1()
  if (reserved) {
    // Giratina V (id 17) sold, payout pending.
    await ensureSeeded(db)
    await db.prepare("UPDATE products SET reserved = 1, sold_at = '2026-10-06', sold_via = 'vinted' WHERE id = 17").run()
  }
  const payload = await buildPublicPayload(db, path)
  return { payload, html: buildPageSnapshot(payload) }
}

/** The text a crawler without JavaScript reads, tags stripped. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('sold cards', () => {
  it('keep their page with the card and its story, never the sale price or the listings', async () => {
    const payload = await buildPublicPayload(createMemoryD1(), '/products/charizard-2016-radiant-collection-rc5')

    expect(payload.product).toBeNull()
    expect(payload.notFound).toBe(false)
    expect(payload.soldProduct).toMatchObject({
      id: 3,
      title: 'Charizard',
      subtitle: '2016 Radiant Collection - #RC5',
      slug: 'charizard-2016-radiant-collection-rc5',
      images: ['/media/61958598_front-sold.webp'],
      pokemonId: 6,
      language: 'english',
      grader: 'psa',
      grade: 9,
      year: 2016
    })
    expect(payload.soldProduct?.description).toContain('Radiant Collection, number RC5/RC32.')
    for (const field of ['price', 'cost', 'soldAt', 'soldVia', 'marktplaatsUrl', 'vintedUrl', 'cardmarketUrl']) {
      expect(payload.soldProduct).not.toHaveProperty(field)
    }
    expect(JSON.stringify(payload)).not.toContain('€115')
    expect(payload.similarProductIds.length).toBeGreaterThan(0)
    expect(payload.products.some((product) => product.slug === 'charizard-2016-radiant-collection-rc5')).toBe(false)
  })

  it('answer 200 like any other page; only a missing page is a 404', async () => {
    const db = createMemoryD1()

    expect(publicPageStatus(await buildPublicPayload(db, '/products/charizard-2016-radiant-collection-rc5'))).toBe(200)
    expect(publicPageStatus(await buildPublicPayload(db, '/products/no-such-card'))).toBe(404)
    expect(publicPageStatus(await buildPublicPayload(db, '/nowhere'))).toBe(404)
    expect(publicPageStatus(await buildPublicPayload(db, '/products/ekans-2000-team-rocket-56'))).toBe(200)
  })
})

describe('page snapshot for crawlers without JavaScript', () => {
  it('writes a product page with its name, story, price, listings and links to other cards', async () => {
    const { payload, html } = await snapshotFor('/products/slowpoke-1999-fossil-55')

    expect(html).toContain('<h1>Slowpoke PSA 9 - 1999 Fossil #55</h1>')
    expect(text(html)).toContain('Fossil set, number 55/62.')
    expect(html).toContain('<dt>Price</dt><dd>€120</dd>')
    expect(html).toContain('<dt>Grade</dt><dd>PSA 9</dd>')
    expect(html).toContain('<a href="https://www.marktplaats.nl/seller/view/m2448075737">View on Marktplaats</a>')
    // The card's own listing, whichever it is today: every relist gives it a new one.
    const vintedUrl = payload.product?.vintedUrl
    expect(vintedUrl).toMatch(/^https:\/\/www\.vinted\.nl\/items\/\d+$/)
    expect(html).toContain(`<a href="${vintedUrl}">View on Vinted</a>`)
    for (const id of payload.similarProductIds) {
      const similar = payload.products.find((product) => product.id === id)!
      expect(html).toContain(`<a href="/products/${similar.slug}/">`)
    }
  })

  it('says a reserved card is reserved, without a price or a buy link', async () => {
    const { html } = await snapshotFor('/products/giratina-v-2022-lost-origin-185', { reserved: true })

    expect(html).toContain('<dt>Status</dt><dd>reserved</dd>')
    expect(html).toContain('This card is reserved')
    expect(html).not.toContain('<dt>Price</dt>')
    expect(html).not.toContain('View on Marktplaats')
  })

  it('writes a sold card as the card it was, marked sold, pointing to the cards still for sale', async () => {
    const { html } = await snapshotFor('/products/charizard-2016-radiant-collection-rc5')

    expect(html).toContain('<h1>Charizard PSA 9 - 2016 Radiant Collection #RC5</h1>')
    expect(text(html)).toContain('Radiant Collection, number RC5/RC32.')
    expect(html).toContain('<dt>Status</dt><dd>sold</dd>')
    expect(html).toContain('<a href="/products/">See all cards for sale</a>')
    expect(html).toContain('<h2>Still for sale</h2>')
    expect(html).not.toContain('€115')
    expect(html).not.toContain('<dt>Price</dt>')
  })

  it("writes the card's story in its sections, under the card", async () => {
    const { payload } = await snapshotFor('/products/ekans-2000-team-rocket-56')
    const html = buildPageSnapshot({
      ...payload,
      product: { ...payload.product!, about: 'Ekans & co.\n\n## The card\nA **1st Edition** print.\n\n## The grade\nPSA 9 Mint.' }
    })

    expect(html).toContain(
      '<section><h2>About this Ekans</h2><p>Ekans &amp; co.</p><h3>The card</h3><p>A <strong>1st Edition</strong> print.</p><h3>The grade</h3><p>PSA 9 Mint.</p></section></article>'
    )
  })

  it('lists every card for sale on the home page, never a reserved one', async () => {
    const { payload, html } = await snapshotFor('/', { reserved: true })
    const forSale = payload.products.filter((product) => !product.reserved)

    expect(forSale.length).toBeGreaterThan(4)
    for (const product of forSale) {
      expect(html).toContain(`<a href="/products/${product.slug}/">`)
    }
    expect(html).not.toContain('/products/giratina-v-2022-lost-origin-185/')
  })

  it('lists every card in the shop on the products page, reserved ones as reserved', async () => {
    const { payload, html } = await snapshotFor('/products', { reserved: true })

    expect(html.match(/<h1>/g)).toHaveLength(1)
    for (const product of payload.products) {
      expect(html).toContain(`<a href="/products/${product.slug}/">`)
    }
    expect(html).toContain('Slowpoke PSA 9 - 1999 Fossil #55</a>, €120')
    expect(html).toContain('Giratina V PSA 9 - 2022 Lost Origin #185</a>, reserved')
  })

  it('writes the FAQ answers and the navigation', async () => {
    const { html } = await snapshotFor('/about')

    expect(html).toContain('<h3>What is Hello World Cards?</h3>')
    expect(html).toContain('<a href="/products/">Products</a>')
    expect(html).toContain('<a href="mailto:helloworldcards@outlook.com">')
  })

  it('escapes CMS text and keeps its inline markdown links', async () => {
    const payload = await buildPublicPayload(createMemoryD1(), '/')
    const html = buildPageSnapshot({
      ...payload,
      page: {
        ...payload.page!,
        blocks: [
          { id: 'x', type: 'content_text', title: 'Cards & <slabs>', description: 'See **these** [events](/agenda/).\n\nA <script>.' }
        ]
      }
    })

    expect(html).toContain('<h1>Cards &amp; &lt;slabs&gt;</h1>')
    expect(html).toContain('<p>See <strong>these</strong> <a href="/agenda/">events</a>.</p><p>A &lt;script&gt;.</p>')
  })

  it('only fills an empty root', () => {
    expect(applyPageSnapshot('<div id="root"></div>', '<p>ok</p>')).toBe('<div id="root"><p>ok</p></div>')
    expect(applyPageSnapshot('<div id="root"><p>app</p></div>', '<p>ok</p>')).toBe('<div id="root"><p>app</p></div>')
  })

  it('is hidden from people, fills the root of the shell, and never goes on the admin', async () => {
    const payload = await buildPublicPayload(createMemoryD1(), '/')
    const page = injectCmsPayload(SHELL, payload, { path: '/' })
    const admin = injectCmsPayload(SHELL, null, { admin: true, path: '/' })

    expect(page).toMatch(/<div id="root"><div data-snapshot style="position:absolute;width:1px;height:1px;[^"]*">/)
    expect(page).not.toContain('<img')
    expect(admin).toContain('<div id="root"></div>')
  })
})
