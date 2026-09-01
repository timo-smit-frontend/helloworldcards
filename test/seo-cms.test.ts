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
  it('keeps the Store + WebSite graph on the homepage fallback shell', () => {
    const seo = getSeoForPath('/')
    const store = graph(seo).find((node) => node['@type'] === 'Store')

    expect(store).toMatchObject({
      name: SITE_NAME,
      founder: [{ name: 'Sam' }, { name: 'Timo' }]
    })
    expect(types(seo)).toEqual(['Store', 'WebSite', 'WebPage'])
  })

  it('builds homepage JSON-LD from published CMS settings', async () => {
    const seo = await seoFor('/')
    const store = graph(seo).find((node) => node['@type'] === 'Store')

    expect(seo.title).toBe(`${SITE_NAME} | Pokémon cards and events`)
    expect(seo.robots).toBe('index, follow')
    expect(seo.canonical).toBe('https://helloworldcards.com/')
    expect(store).toMatchObject({
      name: SITE_NAME,
      founder: [{ name: 'Sam' }, { name: 'Timo' }]
    })
    expect(types(seo)).toEqual(['Store', 'WebSite', 'WebPage'])
  })

  it('lists shop products in JSON-LD on the products page', async () => {
    const seo = await seoFor('/products')
    const list = graph(seo).find((node) => node['@type'] === 'ItemList') as { itemListElement?: Array<{ name?: string }> }

    expect(seo.title).toBe(`Shop | ${SITE_NAME}`)
    expect(list?.itemListElement?.some((item) => item.name === 'Mewtwo')).toBe(true)
  })

  it('marks about as an AboutPage with people and FAQ', async () => {
    const seo = await seoFor('/about')

    expect(types(seo)).toContain('AboutPage')
    expect(graph(seo).some((node) => node['@type'] === 'Person' && node.name === 'Sam')).toBe(true)
    expect(graph(seo).some((node) => node['@type'] === 'Person' && node.name === 'Timo')).toBe(true)
    expect(graph(seo).some((node) => node['@type'] === 'FAQPage')).toBe(true)
  })

  it('adds product breadcrumbs and the image alt from media copy', async () => {
    const seo = await seoFor('/products/mewtwo-2016-evolutions-51')

    expect(seo.type).toBe('product')
    expect(types(seo)).toContain('ItemPage')
    expect(graph(seo).some((node) => node['@type'] === 'BreadcrumbList')).toBe(true)
    expect(seo.imageAlt).toContain('Mewtwo')
  })

  it('marks privacy as a PrivacyPolicy with the statement date', async () => {
    const seo = await seoFor('/privacy')
    const page = graph(seo).find((node) => node['@type'] === 'PrivacyPolicy')

    expect(page).toMatchObject({ dateModified: '2026-08-17' })
  })

  it('noindexes unknown paths without a canonical URL', async () => {
    const seo = await seoFor('/does-not-exist')

    expect(seo.robots).toContain('noindex')
    expect(seo.canonical).toBeNull()
    expect(types(seo)).toEqual(['Store', 'WebSite'])
  })
})
