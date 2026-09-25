import { describe, expect, it } from 'vitest'
import { applyPageSnapshot, buildPageSnapshot } from '~/seo/snapshot'
import { injectCmsPayload } from '../worker/cms/html'
import { buildPublicPayload, publicPageStatus } from '../worker/cms/public'
import { createMemoryD1 } from './helpers/memory-d1'

const SHELL = '<html><head><title>x</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'

async function snapshotFor(path: string) {
  const payload = await buildPublicPayload(createMemoryD1(), path)
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
  it('keep their old address as a sold page with what is still for sale, never the sale price', async () => {
    const payload = await buildPublicPayload(createMemoryD1(), '/products/charizard-2016-radiant-collection-rc5')

    expect(payload.product).toBeNull()
    expect(payload.notFound).toBe(false)
    expect(payload.soldProduct).toEqual({
      id: 3,
      title: 'Charizard',
      subtitle: '2016 Radiant Collection - #RC5',
      slug: 'charizard-2016-radiant-collection-rc5',
      images: ['/media/61958598_front-sold.webp'],
      pokemonId: 6,
      grader: 'psa',
      grade: 9
    })
    expect(JSON.stringify(payload)).not.toContain('€115')
    expect(payload.similarProductIds.length).toBeGreaterThan(0)
    expect(payload.products.some((product) => product.slug === 'charizard-2016-radiant-collection-rc5')).toBe(false)
  })

  it('answer 410 Gone, a missing page 404, and everything else 200', async () => {
    const db = createMemoryD1()

    expect(publicPageStatus(await buildPublicPayload(db, '/products/charizard-2016-radiant-collection-rc5'))).toBe(410)
    expect(publicPageStatus(await buildPublicPayload(db, '/products/no-such-card'))).toBe(404)
    expect(publicPageStatus(await buildPublicPayload(db, '/nowhere'))).toBe(404)
    expect(publicPageStatus(await buildPublicPayload(db, '/products/mewtwo-2016-evolutions-51'))).toBe(200)
    expect(publicPageStatus(await buildPublicPayload(db, '/products/lugia-v-2022-silver-tempest-185'))).toBe(200)
  })
})

describe('page snapshot for crawlers without JavaScript', () => {
  it('writes a product page with its name, story, price, listings and links to other cards', async () => {
    const { payload, html } = await snapshotFor('/products/mewtwo-2016-evolutions-51')

    expect(html).toContain('<h1>Mewtwo PSA 9 - 2016 Evolutions #51</h1>')
    expect(text(html)).toContain('A reverse holo from the 2016 XY Evolutions set, number 51/108.')
    expect(html).toContain('<dt>Price</dt><dd>€75</dd>')
    expect(html).toContain('<dt>Grade</dt><dd>PSA 9</dd>')
    expect(html).toContain('<a href="https://www.marktplaats.nl/seller/view/m2436737465">View on Marktplaats</a>')
    expect(html).toContain('<a href="https://www.vinted.nl/items/10133855293">View on Vinted</a>')
    for (const id of payload.similarProductIds) {
      const similar = payload.products.find((product) => product.id === id)!
      expect(html).toContain(`<a href="/products/${similar.slug}/">`)
    }
  })

  it('says a reserved card is reserved, without a price or a buy link', async () => {
    const { html } = await snapshotFor('/products/lugia-v-2022-silver-tempest-185')

    expect(html).toContain('<dt>Status</dt><dd>reserved</dd>')
    expect(html).toContain('This card is reserved')
    expect(html).not.toContain('€40')
    expect(html).not.toContain('View on Marktplaats')
  })

  it('says a sold card has sold and points to the cards still for sale', async () => {
    const { html } = await snapshotFor('/products/charizard-2016-radiant-collection-rc5')

    expect(html).toContain('<h1>Charizard has sold</h1>')
    expect(html).toContain('<a href="/products/">See all cards for sale</a>')
    expect(html).toContain('<h2>Still for sale</h2>')
    expect(html).not.toContain('€115')
  })

  it('lists every card in the shop on the products page, reserved ones as reserved', async () => {
    const { payload, html } = await snapshotFor('/products')

    expect(html.match(/<h1>/g)).toHaveLength(1)
    for (const product of payload.products) {
      expect(html).toContain(`<a href="/products/${product.slug}/">`)
    }
    expect(html).toContain('Mewtwo PSA 9 - 2016 Evolutions #51</a>, €75')
    expect(html).toContain('Lugia V PSA 9 - 2022 Silver Tempest #185</a>, reserved')
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
