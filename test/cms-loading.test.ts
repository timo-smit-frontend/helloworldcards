import { describe, expect, it } from 'vitest'
import { isCmsReadyForPath } from '~/cms/ready'
import type { PublicCmsPayload } from '~/cms/types'

function payload(overrides: Partial<PublicCmsPayload> = {}): PublicCmsPayload {
  return {
    settings: {
      siteDescription: 'Graded Pokémon cards',
      siteImage: '/media/hero.jpg',
      siteImageAlt: 'Hello World Cards',
      contactEmail: 'hello@example.com',
      instagramUrl: 'https://instagram.com/example',
      marktplaatsUrl: 'https://example.com',
      notFoundTitle: 'Not found',
      notFoundDescription: 'Missing',
      notFoundCta: 'Home'
    },
    nav: { header: [], footer: [] },
    page: {
      id: 1,
      path: '/',
      title: 'Home',
      status: 'published',
      seoTitle: 'Home',
      seoDescription: 'Home page',
      seoImage: null,
      blocks: []
    },
    product: null,
    similarProductIds: [],
    products: [],
    events: [],
    faqs: [],
    mediaCopy: {},
    notFound: false,
    ...overrides
  }
}

describe('isCmsReadyForPath', () => {
  it('is ready when the resolved path matches the requested path', () => {
    expect(isCmsReadyForPath(payload(), '/', '/')).toBe(true)
    expect(isCmsReadyForPath(payload(), '/about', '/about/')).toBe(true)
  })

  it('is not ready without payload or resolved path', () => {
    expect(isCmsReadyForPath(null, '/', '/')).toBe(false)
    expect(isCmsReadyForPath(payload(), null, '/')).toBe(false)
  })

  it('is not ready when navigating before the next payload arrives', () => {
    const home = payload()
    const product = payload({
      page: null,
      product: {
        id: 1,
        slug: 'pikachu',
        title: 'Pikachu',
        subtitle: 'Base Set',
        description: 'A classic card',
        images: []
      }
    })

    expect(isCmsReadyForPath(home, '/', '/products/pikachu/')).toBe(false)
    expect(isCmsReadyForPath(product, '/products/pikachu', '/')).toBe(false)
  })
})
