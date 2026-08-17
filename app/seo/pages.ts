import { getUpcomingEvents } from '../database/events'
import { getFaqsByPage, type FaqItem } from '../database/faq'
import { getAllProducts, getProductBySlug, type Product } from '../database/products'
import { CONTACT_EMAIL, INSTAGRAM_URL } from '../services/contact'
import { PRODUCT_IMAGE_SIZES, PRIORITY_IMAGE_SIZES, isLocalRasterSrc } from '../services/responsiveImage'
import { SITE_DESCRIPTION, SITE_IMAGE, SITE_NAME, SITE_URL, toAbsoluteUrl } from './site'

export type LcpImage = {
  src: string
  maxWidth: number
  sizes: string
}

export type SeoPage = {
  path: string
  title: string
  description: string
  image: string
  type: 'website' | 'product'
  robots: string
  canonical: string | null
  jsonLd: Record<string, unknown>
  lcp?: LcpImage
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`

function canonicalUrl(path: string): string {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`
}

function normalizePath(pathname: string): string {
  const path = pathname.split('?')[0]?.split('#')[0] ?? '/'
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1)
  }
  return path || '/'
}

function titleWithBrand(pageTitle: string): string {
  return `${pageTitle} | ${SITE_NAME}`
}

function serializeJsonLdGraph(graph: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': graph
  }
}

function organizationNode(): Record<string, unknown> {
  return {
    '@type': 'Store',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    email: CONTACT_EMAIL,
    image: toAbsoluteUrl(SITE_IMAGE),
    sameAs: [INSTAGRAM_URL],
    founder: [
      { '@type': 'Person', name: 'Sam', jobTitle: 'Co-founder' },
      { '@type': 'Person', name: 'Timo', jobTitle: 'Co-founder' }
    ],
    areaServed: [
      { '@type': 'Country', name: 'Netherlands' },
      { '@type': 'Country', name: 'Belgium' }
    ],
    knowsAbout: ['Pokémon', 'Pokémon Trading Card Game', 'Pokémon art'],
    contactPoint: {
      '@type': 'ContactPoint',
      email: CONTACT_EMAIL,
      contactType: 'customer service'
    }
  }
}

function websiteNode(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'en-GB',
    publisher: { '@id': ORGANIZATION_ID }
  }
}

function webPageNode({
  path,
  title,
  description,
  type = 'WebPage',
  dateModified
}: {
  path: string
  title: string
  description: string
  type?: string
  dateModified?: string
}): Record<string, unknown> {
  const url = canonicalUrl(path)

  return {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORGANIZATION_ID },
    ...(dateModified ? { dateModified } : {})
  }
}

function euroPrice(price: string | number): string | undefined {
  if (typeof price === 'number') {
    return String(price)
  }

  const normalized = price.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')
  return normalized || undefined
}

function productNodes(product: Product, path: string): Array<Record<string, unknown>> {
  const url = canonicalUrl(path)
  const offerPrice = product.price != null ? euroPrice(product.price) : undefined
  const productNode: Record<string, unknown> = {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.title,
    description: product.description || product.subtitle,
    image: product.images,
    brand: { '@type': 'Brand', name: SITE_NAME },
    category: 'Pokémon Trading Card Game',
    url
  }

  if (offerPrice) {
    productNode.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'EUR',
      price: offerPrice,
      availability: 'https://schema.org/InStock',
      seller: { '@id': ORGANIZATION_ID }
    }
  }

  const breadcrumbs: Record<string, unknown> = {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Products', item: canonicalUrl('/products') },
      { '@type': 'ListItem', position: 3, name: product.title, item: url }
    ]
  }

  return [productNode, breadcrumbs]
}

function productListNode(path: string): Record<string, unknown> {
  const products = getAllProducts()

  return {
    '@type': 'ItemList',
    '@id': `${canonicalUrl(path)}#products`,
    name: 'All products',
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: canonicalUrl(`/products/${product.slug}`),
      name: product.title
    }))
  }
}

function eventNodes(path: string): Record<string, unknown> {
  const events = getUpcomingEvents()

  return {
    '@type': 'ItemList',
    '@id': `${canonicalUrl(path)}#events`,
    name: 'Upcoming events',
    itemListElement: events.map((event, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Event',
        name: event.title,
        startDate: event.date,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {
          '@type': 'Place',
          name: event.location,
          address: event.location
        },
        organizer: { '@id': ORGANIZATION_ID }
      }
    }))
  }
}

function faqPageNode(path: string, items: FaqItem[]): Record<string, unknown> {
  const url = canonicalUrl(path)

  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  }
}

function aboutNodes(path: string): Array<Record<string, unknown>> {
  const url = canonicalUrl(path)

  return [
    {
      '@type': 'Person',
      '@id': `${url}#sam`,
      name: 'Sam',
      jobTitle: 'Co-founder',
      description:
        'Backend developer, and a die-hard Wooper and Quagsire collector. The muddy, dopey Water-types are a forever chase. Psyduck and Slowpoke live in the same pile, Mew shows up whenever the art is too pretty to skip, and cute or pretty full arts almost never get walked past at a table.',
      url,
      worksFor: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'Person',
      '@id': `${url}#timo`,
      name: 'Timo',
      jobTitle: 'Co-founder',
      description:
        'Frontend developer who has been after Gengar and Ralts for years. Ghosts, psychics, and a few odd frogs: Mewtwo still stops a scroll, Shroomish is an easy yes, and Flygon and Politoed are the ones that make an event stall last a little longer than it should.',
      url,
      worksFor: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'About', item: url }
      ]
    },
    faqPageNode(path, getFaqsByPage('about'))
  ]
}

function page({
  path,
  title,
  description,
  image = SITE_IMAGE,
  type = 'website',
  robots = 'index, follow',
  extraGraph = [],
  webPageType,
  dateModified,
  lcp
}: {
  path: string
  title: string
  description: string
  image?: string
  type?: 'website' | 'product'
  robots?: string
  extraGraph?: Array<Record<string, unknown>>
  webPageType?: string
  dateModified?: string
  lcp?: LcpImage
}): SeoPage {
  return {
    path,
    title,
    description,
    image: toAbsoluteUrl(image),
    type,
    robots,
    canonical: robots.includes('noindex') ? null : canonicalUrl(path),
    lcp,
    jsonLd: serializeJsonLdGraph(
      robots.includes('noindex')
        ? [organizationNode(), websiteNode()]
        : [
            organizationNode(),
            websiteNode(),
            webPageNode({
              path,
              title,
              description,
              type: webPageType ?? (type === 'product' ? 'ItemPage' : 'WebPage'),
              dateModified
            }),
            ...extraGraph
          ]
    )
  }
}

function productPage(product: Product): SeoPage {
  const path = `/products/${product.slug}`
  const blurb = product.description || product.subtitle
  const description = product.price
    ? `${product.title}: ${blurb}. ${product.price} at Hello World Cards.`
    : `${product.title}: ${blurb}. Available at Hello World Cards.`

  return page({
    path,
    title: titleWithBrand(product.title),
    description,
    image: product.images[0] ?? SITE_IMAGE,
    type: 'product',
    extraGraph: productNodes(product, path),
    lcp:
      product.images[0] && isLocalRasterSrc(product.images[0])
        ? { src: product.images[0], maxWidth: 1000, sizes: PRODUCT_IMAGE_SIZES }
        : undefined
  })
}

function notFoundPage(path: string): SeoPage {
  return page({
    path,
    title: titleWithBrand('Page not found'),
    description: 'This page does not exist or has been moved.',
    robots: 'noindex, nofollow'
  })
}

export function getSeoForPath(pathname: string): SeoPage {
  const path = normalizePath(pathname)

  if (path === '/') {
    return page({
      path,
      title: `${SITE_NAME} | Pokémon cards, art, and events`,
      description: SITE_DESCRIPTION,
      lcp: { src: SITE_IMAGE, maxWidth: 800, sizes: PRIORITY_IMAGE_SIZES }
    })
  }

  if (path === '/products') {
    return page({
      path,
      title: titleWithBrand('Shop'),
      description: 'Browse our collection of Pokémon cards and art, pieces we love having around.',
      extraGraph: [productListNode(path)]
    })
  }

  if (path === '/agenda') {
    return page({
      path,
      title: titleWithBrand('Upcoming events'),
      description: "We'll be at these Pokémon events. Come say hi, browse the stall, and see what's new.",
      extraGraph: [eventNodes(path)]
    })
  }

  if (path === '/about') {
    return page({
      path,
      title: titleWithBrand('About'),
      description:
        "We're Sam and Timo, a couple who turned a Pokémon hobby into Hello World Cards, a small shop for cards, art, and the events we go to.",
      webPageType: 'AboutPage',
      extraGraph: aboutNodes(path)
    })
  }

  if (path === '/contact') {
    return page({
      path,
      title: titleWithBrand('Contact'),
      description: "Questions about a card, an event, or something in the shop? Send us a message. We'd love to hear from you.",
      extraGraph: [faqPageNode(path, getFaqsByPage('contact'))]
    })
  }

  if (path === '/privacy') {
    return page({
      path,
      title: titleWithBrand('Privacy statement'),
      description:
        'How Hello World Cards uses Google Tag Manager and Microsoft Clarity, and what happens when you send Sam and Timo a message.',
      webPageType: 'PrivacyPolicy',
      dateModified: '2026-08-17',
      extraGraph: [
        {
          '@type': 'BreadcrumbList',
          '@id': `${canonicalUrl(path)}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
            { '@type': 'ListItem', position: 2, name: 'Privacy statement', item: canonicalUrl(path) }
          ]
        }
      ]
    })
  }

  const productMatch = path.match(/^\/products\/([^/]+)$/)
  if (productMatch?.[1]) {
    const product = getProductBySlug(productMatch[1])
    return product ? productPage(product) : notFoundPage(path)
  }

  return notFoundPage(path)
}

export function getIndexableSeoPages(): SeoPage[] {
  return [
    getSeoForPath('/'),
    getSeoForPath('/products'),
    getSeoForPath('/agenda'),
    getSeoForPath('/about'),
    getSeoForPath('/contact'),
    getSeoForPath('/privacy'),
    ...getAllProducts().map((product) => productPage(product))
  ]
}
