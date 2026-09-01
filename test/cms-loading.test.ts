import { describe, expect, it } from 'vitest'
import { readCachedCmsPayload, writeCachedCmsPayload } from '~/cms/cache'
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

describe('CMS cache', () => {
  it('reads cached payloads by normalized path', () => {
    const home = payload()
    const cache = writeCachedCmsPayload(new Map(), '/', home)

    expect(readCachedCmsPayload(cache, '/')).toEqual(home)
    expect(readCachedCmsPayload(cache, '/about/')).toBeNull()
  })

  it('keeps previously visited pages available while navigating', () => {
    const home = payload()
    const about = payload({ page: { ...home.page!, path: '/about', title: 'About' } })
    let cache = writeCachedCmsPayload(new Map(), '/', home)
    cache = writeCachedCmsPayload(cache, '/about', about)

    expect(readCachedCmsPayload(cache, '/about/')).toEqual(about)
    expect(readCachedCmsPayload(cache, '/products/pikachu/')).toBeNull()
  })

  it('starts empty without a boot payload', () => {
    expect(readCachedCmsPayload(new Map(), '/')).toBeNull()
  })
})
