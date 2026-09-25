import { describe, expect, it } from 'vitest'
import { getSeoForPayload } from '~/seo/cms'
import { getSeoForPath } from '~/seo/pages'
import type { SeoPage } from '~/seo/pages'
import { SITE_NAME } from '~/seo/site'
import { buildPublicPayload } from '../worker/cms/public'
import { createMemoryD1 } from './helpers/memory-d1'

function graph(seo: SeoPage): Array<Record<string, unknown>> {
  return (seo.jsonLd['@graph'] as Array<Record<string, unknown>> | undefined) ?? []
}

function types(seo: SeoPage): string[] {
  return graph(seo).map((node) => String(node['@type']))
}

async function seoFor(path: string): Promise<SeoPage> {
  const payload = await buildPublicPayload(createMemoryD1(), path)
  return getSeoForPayload(path, payload)
}

describe('CMS SEO', () => {
  it('keeps the OnlineStore + WebSite graph on the homepage fallback shell', () => {
    const seo = getSeoForPath('/')
    const store = graph(seo).find((node) => node['@type'] === 'OnlineStore')

    expect(store).toMatchObject({
      name: SITE_NAME,
      founder: { name: 'Timo', jobTitle: 'Owner' }
    })
    expect(types(seo)).toEqual(['OnlineStore', 'WebSite', 'WebPage'])
  })

  it('builds homepage JSON-LD from published CMS settings', async () => {
    const seo = await seoFor('/')
    const store = graph(seo).find((node) => node['@type'] === 'OnlineStore')

    expect(seo.title).toBe(`${SITE_NAME} | Graded Pokémon cards and events`)
    expect(seo.robots).toBe('index, follow')
    expect(seo.canonical).toBe('https://helloworldcards.com/')
    expect(store).toMatchObject({
      name: SITE_NAME,
      founder: { name: 'Timo', jobTitle: 'Owner' }
    })
    expect(types(seo)).toEqual(['OnlineStore', 'WebSite', 'WebPage'])
  })

  it('lists shop products in JSON-LD on the products page', async () => {
    const seo = await seoFor('/products')
    const list = graph(seo).find((node) => node['@type'] === 'ItemList') as { itemListElement?: Array<{ name?: string }> }

    expect(seo.title).toBe(`Graded Pokémon cards for sale | ${SITE_NAME}`)
    expect(list?.itemListElement?.some((item) => item.name === 'Mewtwo PSA 9 - 2016 Evolutions #51')).toBe(true)
  })

  it('marks about as an AboutPage with people and FAQ', async () => {
    const seo = await seoFor('/about')

    expect(types(seo)).toContain('AboutPage')
    const person = (name: string) => graph(seo).find((node) => node['@type'] === 'Person' && node.name === name)
    // A one-person business: Timo owns the shop, Sam is on the page as Timo's partner, not as staff.
    expect(person('Timo')).toMatchObject({ jobTitle: 'Owner', worksFor: { '@id': 'https://helloworldcards.com/#organization' } })
    expect(person('Sam')).toBeDefined()
    expect(person('Sam')).not.toHaveProperty('jobTitle')
    expect(person('Sam')).not.toHaveProperty('worksFor')
    expect(graph(seo).some((node) => node['@type'] === 'FAQPage')).toBe(true)
  })

  it('adds product breadcrumbs and the image alt from media copy', async () => {
    const seo = await seoFor('/products/mewtwo-2016-evolutions-51')

    expect(seo.type).toBe('product')
    expect(types(seo)).toContain('ItemPage')
    expect(graph(seo).some((node) => node['@type'] === 'BreadcrumbList')).toBe(true)
    expect(seo.imageAlt).toContain('Mewtwo')
  })

  it('names a product page the way buyers search for it', async () => {
    const seo = await seoFor('/products/mewtwo-2016-evolutions-51')

    expect(seo.title).toBe(`Mewtwo PSA 9 - 2016 Evolutions #51 | ${SITE_NAME}`)
    expect(seo.description).toBe(
      'Mewtwo PSA 9, 2016 Evolutions #51, for €75. A reverse holo from the 2016 XY Evolutions set, number 51/108.'
    )
    expect((await seoFor('/products/zorua-ar-2025-white-flare-japanese-140')).title).toBe(
      `Zorua AR BGS 9.5 - 2025 White Flare Japanese #140 | ${SITE_NAME}`
    )
  })

  it('keeps every product description to whole sentences that fit a search result', async () => {
    const payload = await buildPublicPayload(createMemoryD1(), '/products')
    for (const product of payload.products) {
      const seo = await seoFor(`/products/${product.slug}`)
      expect(seo.description.length, product.slug).toBeLessThanOrEqual(160)
      expect(seo.description, product.slug).toMatch(/\.$/)
      expect(seo.description, product.slug).not.toContain('..')
    }
  })

  it('describes a card for sale as a Product with an in-stock offer', async () => {
    const seo = await seoFor('/products/mewtwo-2016-evolutions-51')
    const product = graph(seo).find((node) => node['@type'] === 'Product')

    expect(product).toMatchObject({
      '@id': 'https://helloworldcards.com/products/mewtwo-2016-evolutions-51/#product',
      name: 'Mewtwo PSA 9 - 2016 Evolutions #51',
      brand: { '@type': 'Brand', name: 'Pokémon' },
      image: ['https://helloworldcards.com/media/148651617_front.jpg', 'https://helloworldcards.com/media/148651617_back.jpg'],
      offers: {
        '@type': 'Offer',
        url: 'https://helloworldcards.com/products/mewtwo-2016-evolutions-51/',
        price: '75.00',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/UsedCondition',
        seller: { '@id': 'https://helloworldcards.com/#organization' }
      }
    })
    expect(product?.additionalProperty).toEqual([
      { '@type': 'PropertyValue', name: 'Grade', value: 'PSA 9' },
      { '@type': 'PropertyValue', name: 'Language', value: 'English' },
      { '@type': 'PropertyValue', name: 'Year', value: 2016 }
    ])
  })

  it('offers a card that is not listed yet as out of stock', async () => {
    const seo = await seoFor('/products/vaporeon-2022-brilliant-stars-tg02')
    const product = graph(seo).find((node) => node['@type'] === 'Product') as { offers?: { availability?: string } } | undefined

    expect(product?.offers?.availability).toBe('https://schema.org/OutOfStock')
  })

  it('keeps a reserved card indexed but without a Product or its sale price', async () => {
    const seo = await seoFor('/products/lugia-v-2022-silver-tempest-185')

    expect(seo.robots).toBe('index, follow')
    expect(types(seo)).not.toContain('Product')
    expect(seo.description).toContain('reserved')
    expect(seo.description).not.toContain('€40')
  })

  it('drops a sold card from the index without showing what it sold for', async () => {
    const seo = await seoFor('/products/charizard-2016-radiant-collection-rc5')

    expect(seo.robots).toBe('noindex, follow')
    expect(seo.canonical).toBeNull()
    expect(seo.title).toBe(`Charizard PSA 9 - 2016 Radiant Collection #RC5 (sold) | ${SITE_NAME}`)
    expect(seo.description).toContain('has sold')
    expect(seo.description).not.toContain('€115')
    expect(types(seo)).not.toContain('Product')
  })

  it('marks privacy as a PrivacyPolicy with the statement date', async () => {
    const seo = await seoFor('/privacy')
    const page = graph(seo).find((node) => node['@type'] === 'PrivacyPolicy')

    expect(page).toMatchObject({ dateModified: '2026-09-25' })
  })

  it('noindexes unknown paths without a canonical URL', async () => {
    const seo = await seoFor('/does-not-exist')

    expect(seo.robots).toContain('noindex')
    expect(seo.canonical).toBeNull()
    expect(types(seo)).toEqual(['OnlineStore', 'WebSite'])
  })
})
