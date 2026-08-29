import { getUpcomingEvents } from '../database/events'
import { getFaqsByPage, type FaqItem } from '../database/faq'
import { getAllProducts, getProductBySlug, type Product } from '../database/products'
import { CONTACT_EMAIL, INSTAGRAM_URL, MARKTPLAATS_URL } from '../services/contact'
import { SITE_IMAGE_ALT, imageAltFor } from '../services/imageCopy'
import { PRODUCT_IMAGE_SIZES, PRIORITY_IMAGE_SIZES, isLocalRasterSrc } from '../services/responsiveImage'
import { SITE_DESCRIPTION, SITE_IMAGE, SITE_NAME, SITE_URL, canonicalUrl, normalizePath, toAbsoluteUrl } from './site'

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
  imageAlt: string
  type: 'website' | 'product'
  robots: string
  canonical: string | null
  jsonLd: Record<string, unknown>
  lcp?: LcpImage
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`
const HOME_URL = canonicalUrl('/')

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
    sameAs: [INSTAGRAM_URL, MARKTPLAATS_URL],
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

function productBreadcrumbs(product: Product, path: string): Record<string, unknown> {
  const url = canonicalUrl(path)

  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: HOME_URL },
      { '@type': 'ListItem', position: 2, name: 'Products', item: canonicalUrl('/products') },
      { '@type': 'ListItem', position: 3, name: product.title, item: url }
    ]
  }
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

function eventListNode(path: string): Record<string, unknown> {
  const events = getUpcomingEvents()

  return {
    '@type': 'ItemList',
    '@id': `${canonicalUrl(path)}#events`,
    name: 'Upcoming events',
    numberOfItems: events.length,
    itemListElement: events.map((event, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `${event.title}, ${event.date}, ${event.location}`
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
        'Backend developer, and a die-hard Wooper and Quagsire collector. The muddy, dopey Water-types are a forever chase. Psyduck and Slowpoke live in the same pile, Snorlax too: same sleepy energy as Sam. Mew shows up whenever the art is too pretty to skip, and cute or pretty full arts almost never get walked past at a table. Sam also paints the binders we bring to events.',
      url,
      worksFor: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'Person',
      '@id': `${url}#timo`,
      name: 'Timo',
      jobTitle: 'Co-founder',
      description:
        'Frontend developer who has been after Gengar and Ralts for years. Ghosts, psychics, and a few odd frogs are a forever chase. Mewtwo still stops a scroll, Shroomish is an easy yes, and Flygon and Politoed are the ones that make an event stall last a little longer than it should. A Gengar or Ralts full art almost never gets walked past at a table. Timo also builds this shop, from the listings to the site itself.',
      url,
      worksFor: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: HOME_URL },
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
  imageAlt = SITE_IMAGE_ALT,
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
  imageAlt?: string
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
    imageAlt,
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
    imageAlt: imageAltFor(product.images[0] ?? SITE_IMAGE) ?? product.title,
    webPageType: 'ItemPage',
    extraGraph: [productBreadcrumbs(product, path)],
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
      title: `${SITE_NAME} | Pokémon cards and events`,
      description: SITE_DESCRIPTION,
      lcp: { src: SITE_IMAGE, maxWidth: 800, sizes: PRIORITY_IMAGE_SIZES }
    })
  }

  if (path === '/products') {
    return page({
      path,
      title: titleWithBrand('Shop'),
      description: 'Browse Pokémon cards listed here and on Marktplaats. The same stock in both places.',
      extraGraph: [productListNode(path)]
    })
  }

  if (path === '/agenda') {
    return page({
      path,
      title: titleWithBrand('Upcoming events'),
      description: 'When we have a stall at a Pokémon event in the Netherlands or Belgium, the date and place will be here.',
      extraGraph: [eventListNode(path)]
    })
  }

  if (path === '/about') {
    return page({
      path,
      title: titleWithBrand('About'),
      description:
        "We're Sam and Timo, a couple of programmers who turned a Pokémon hobby into Hello World Cards. Cards for sale online, binders shown here and sold at events.",
      webPageType: 'AboutPage',
      extraGraph: aboutNodes(path)
    })
  }

  if (path === '/contact') {
    return page({
      path,
      title: titleWithBrand('Contact'),
      description: 'Questions about a card, an event, a binder at a stall, or anything else? Send us a message.',
      extraGraph: [faqPageNode(path, getFaqsByPage('contact'))]
    })
  }

  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return page({
      path: '/dashboard',
      title: titleWithBrand('Dashboard'),
      description: 'Sign in.',
      robots: 'noindex, nofollow, noarchive'
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
            { '@type': 'ListItem', position: 1, name: 'Home', item: HOME_URL },
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
