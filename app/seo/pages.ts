import { SITE_IMAGE_ALT } from '../services/imageCopy'
import { PRIORITY_IMAGE_SIZES } from '../services/responsiveImage'
import { CONTACT_EMAIL, INSTAGRAM_URL, MARKTPLAATS_URL } from '../services/contact'
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

export type SeoIdentity = {
  siteName?: string
  siteDescription?: string
  siteImage?: string
  contactEmail?: string
  instagramUrl?: string
  marktplaatsUrl?: string
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`
export const HOME_URL = canonicalUrl('/')

function titleWithBrand(pageTitle: string): string {
  return `${pageTitle} | ${SITE_NAME}`
}

export function serializeJsonLdGraph(graph: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': graph
  }
}

export function organizationNode(identity: SeoIdentity = {}): Record<string, unknown> {
  const siteName = identity.siteName ?? SITE_NAME
  const siteDescription = identity.siteDescription ?? SITE_DESCRIPTION
  const siteImage = identity.siteImage ?? SITE_IMAGE
  const contactEmail = identity.contactEmail ?? CONTACT_EMAIL
  const instagramUrl = identity.instagramUrl ?? INSTAGRAM_URL
  const marktplaatsUrl = identity.marktplaatsUrl ?? MARKTPLAATS_URL

  return {
    '@type': 'Store',
    '@id': ORGANIZATION_ID,
    name: siteName,
    description: siteDescription,
    url: SITE_URL,
    email: contactEmail,
    image: toAbsoluteUrl(siteImage),
    sameAs: [instagramUrl, marktplaatsUrl],
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
      email: contactEmail,
      contactType: 'customer service'
    }
  }
}

export function websiteNode(identity: SeoIdentity = {}): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: identity.siteName ?? SITE_NAME,
    url: SITE_URL,
    inLanguage: 'en-GB',
    publisher: { '@id': ORGANIZATION_ID }
  }
}

export function webPageNode({
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

export function breadcrumbList(path: string, name: string): Record<string, unknown> {
  const url = canonicalUrl(path)

  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: HOME_URL },
      { '@type': 'ListItem', position: 2, name, item: url }
    ]
  }
}

export function buildSeoPage({
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
  lcp,
  identity
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
  identity?: SeoIdentity
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
        ? [organizationNode(identity), websiteNode(identity)]
        : [
            organizationNode(identity),
            websiteNode(identity),
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

function notFoundPage(path: string): SeoPage {
  return buildSeoPage({
    path,
    title: titleWithBrand('Page not found'),
    description: 'This page does not exist or has been moved.',
    robots: 'noindex, nofollow'
  })
}

export function getSeoForPath(pathname: string): SeoPage {
  const path = normalizePath(pathname)

  if (path === '/dashboard' || path.startsWith('/dashboard/') || path === '/admin' || path.startsWith('/admin/')) {
    return buildSeoPage({
      path,
      title: titleWithBrand('Admin'),
      description: 'Sign in.',
      robots: 'noindex, nofollow, noarchive'
    })
  }

  if (path === '/') {
    return buildSeoPage({
      path,
      title: `${SITE_NAME} | Pokémon cards and events`,
      description: SITE_DESCRIPTION,
      lcp: { src: SITE_IMAGE, maxWidth: 800, sizes: PRIORITY_IMAGE_SIZES }
    })
  }

  return notFoundPage(path)
}

export function getIndexableSeoPages(): SeoPage[] {
  return [getSeoForPath('/')]
}
