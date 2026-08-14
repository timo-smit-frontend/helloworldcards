import { getUpcomingEvents } from '../database/events'
import { getAllProducts, getProductBySlug, type Product } from '../database/products'
import { CONTACT_EMAIL, INSTAGRAM_URL } from '../services/contact'
import { SITE_DESCRIPTION, SITE_IMAGE, SITE_NAME, SITE_URL, toAbsoluteUrl } from './site'

export type SeoPage = {
  path: string
  title: string
  description: string
  image: string
  type: 'website' | 'product'
  robots: string
  canonical: string | null
  jsonLd: Record<string, unknown>
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
    url: SITE_URL,
    email: CONTACT_EMAIL,
    image: toAbsoluteUrl(SITE_IMAGE),
    sameAs: [INSTAGRAM_URL]
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
  type = 'WebPage'
}: {
  path: string
  title: string
  description: string
  type?: string
}): Record<string, unknown> {
  const url = canonicalUrl(path)

  return {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORGANIZATION_ID }
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
    description: product.description,
    image: product.images,
    brand: { '@type': 'Brand', name: SITE_NAME },
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

function aboutNodes(path: string): Array<Record<string, unknown>> {
  const url = canonicalUrl(path)

  return [
    {
      '@type': 'Person',
      '@id': `${url}#sam`,
      name: 'Sam',
      jobTitle: 'Co-founder',
      worksFor: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'Person',
      '@id': `${url}#timo`,
      name: 'Timo',
      jobTitle: 'Co-founder',
      worksFor: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'About', item: url }
      ]
    }
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
  webPageType
}: {
  path: string
  title: string
  description: string
  image?: string
  type?: 'website' | 'product'
  robots?: string
  extraGraph?: Array<Record<string, unknown>>
  webPageType?: string
}): SeoPage {
  return {
    path,
    title,
    description,
    image: toAbsoluteUrl(image),
    type,
    robots,
    canonical: robots.includes('noindex') ? null : canonicalUrl(path),
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
              type: webPageType ?? (type === 'product' ? 'ItemPage' : 'WebPage')
            }),
            ...extraGraph
          ]
    )
  }
}

function productPage(product: Product): SeoPage {
  const path = `/products/${product.slug}`
  const description = product.price
    ? `${product.title}: ${product.description}. ${product.price} at Hello World Cards.`
    : `${product.title}: ${product.description}. Available at Hello World Cards.`

  return page({
    path,
    title: titleWithBrand(product.title),
    description,
    image: product.images[0] ?? SITE_IMAGE,
    type: 'product',
    extraGraph: productNodes(product, path)
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
      description: SITE_DESCRIPTION
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
      description: "Questions about a card, an event, or something in the shop? Send us a message. We'd love to hear from you."
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
    ...getAllProducts().map((product) => productPage(product))
  ]
}
