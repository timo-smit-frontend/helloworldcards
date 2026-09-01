import type { PublicCmsPayload, CmsBlock, CmsFaq, CmsPage, CmsPerson, PublicProduct } from '../cms/types'
import { upcomingEvents } from '../database/events'
import { imageAltFor } from '../services/imageCopy'
import { PRIORITY_IMAGE_SIZES, PRODUCT_IMAGE_SIZES, isLocalRasterSrc } from '../services/responsiveImage'
import { HOME_URL, breadcrumbList, buildSeoPage, getSeoForPath, type SeoIdentity, type SeoPage } from './pages'
import { SITE_NAME, SITE_URL, canonicalUrl } from './site'

function titleWithBrand(pageTitle: string): string {
  return pageTitle.includes(SITE_NAME) ? pageTitle : `${pageTitle} | ${SITE_NAME}`
}

function identityFrom(payload: PublicCmsPayload): SeoIdentity {
  const settings = payload.settings
  return {
    siteDescription: settings.siteDescription,
    siteImage: settings.siteImage,
    contactEmail: settings.contactEmail,
    instagramUrl: settings.instagramUrl,
    marktplaatsUrl: settings.marktplaatsUrl
  }
}

function altFor(src: string, payload: PublicCmsPayload, fallback: string): string {
  return payload.mediaCopy[src]?.alt || imageAltFor(src) || fallback
}

const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12'
}

function toIsoDate(value?: string): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const match = trimmed.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/)
  if (!match) return undefined
  const month = MONTHS[match[2].toLowerCase()]
  if (!month) return undefined
  return `${match[3]}-${month}-${match[1].padStart(2, '0')}`
}

function displayName(page: CmsPage): string {
  if (page.path === '/') return 'Home'
  const suffix = ` | ${SITE_NAME}`
  if (page.seoTitle.endsWith(suffix)) return page.seoTitle.slice(0, -suffix.length)
  return page.title
}

function productBreadcrumbs(product: PublicProduct, path: string): Record<string, unknown> {
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

function productListNode(path: string, products: PublicProduct[]): Record<string, unknown> {
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

function eventListNode(path: string, events: Array<{ title: string; date: string; location: string }>): Record<string, unknown> {
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

function faqPageNode(path: string, items: CmsFaq[]): Record<string, unknown> {
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

function aboutPersonNodes(path: string, people: CmsPerson[]): Array<Record<string, unknown>> {
  const url = canonicalUrl(path)

  return people.map((person) => ({
    '@type': 'Person',
    '@id': `${url}#${person.name.toLowerCase()}`,
    name: person.name,
    jobTitle: 'Co-founder',
    description: person.description,
    url,
    worksFor: { '@id': `${SITE_URL}/#organization` }
  }))
}

function faqsForBlock(faqs: CmsFaq[], ids?: number[]): CmsFaq[] {
  if (!ids?.length) return []
  const byId = new Map(faqs.map((item) => [item.id, item]))
  return ids.map((id) => byId.get(id)).filter((item): item is CmsFaq => item != null)
}

function extraGraphForPage(
  page: CmsPage,
  payload: PublicCmsPayload
): {
  extraGraph: Array<Record<string, unknown>>
  webPageType?: string
  dateModified?: string
} {
  const extraGraph: Array<Record<string, unknown>> = []
  let webPageType: string | undefined
  let dateModified: string | undefined

  if (page.blocks.some((block) => block.type === 'content_products' && !block.random)) {
    extraGraph.push(productListNode(page.path, payload.products))
  }

  if (page.blocks.some((block) => block.type === 'content_agenda')) {
    extraGraph.push(eventListNode(page.path, upcomingEvents(payload.events)))
  }

  const about = page.blocks.find((block): block is Extract<CmsBlock, { type: 'content_about' }> => block.type === 'content_about')
  if (about) {
    webPageType = 'AboutPage'
    extraGraph.push(...aboutPersonNodes(page.path, about.people), breadcrumbList(page.path, displayName(page)))
  }

  const faq = page.blocks.find((block) => block.type === 'content_faq')
  if (faq?.type === 'content_faq') {
    const items = faqsForBlock(payload.faqs, faq.faqIds)
    if (items.length) extraGraph.push(faqPageNode(page.path, items))
  }

  if (page.path === '/privacy') {
    webPageType = 'PrivacyPolicy'
    const text = page.blocks.find((block) => block.type === 'content_text')
    dateModified = text?.type === 'content_text' ? toIsoDate(text.updated) : undefined
    extraGraph.push(breadcrumbList(page.path, displayName(page)))
  }

  return { extraGraph, webPageType, dateModified }
}

export function getSeoForPayload(pathname: string, payload: PublicCmsPayload | null | undefined): SeoPage {
  if (!payload) {
    return getSeoForPath(pathname)
  }

  const settings = payload.settings
  const identity = identityFrom(payload)

  if (payload.product) {
    const product = payload.product
    const path = `/products/${product.slug}`
    const blurb = product.description || product.subtitle
    const description = product.price
      ? `${product.title}: ${blurb}. ${product.price} at ${SITE_NAME}.`
      : `${product.title}: ${blurb}. Available at ${SITE_NAME}.`
    const image = product.images[0] ?? settings.siteImage
    return buildSeoPage({
      path,
      title: titleWithBrand(product.title),
      description,
      image,
      imageAlt: altFor(image, payload, product.title),
      type: 'product',
      extraGraph: [productBreadcrumbs(product, path)],
      webPageType: 'ItemPage',
      identity,
      lcp:
        product.images[0] && isLocalRasterSrc(product.images[0])
          ? { src: product.images[0], maxWidth: 1000, sizes: PRODUCT_IMAGE_SIZES }
          : undefined
    })
  }

  if (payload.notFound || !payload.page) {
    return buildSeoPage({
      path: pathname,
      title: titleWithBrand(settings.notFoundTitle),
      description: settings.notFoundDescription,
      image: settings.siteImage,
      imageAlt: settings.siteImageAlt,
      robots: 'noindex, nofollow',
      identity
    })
  }

  const page = payload.page
  const image = page.seoImage || settings.siteImage
  const { extraGraph, webPageType, dateModified } = extraGraphForPage(page, payload)
  return buildSeoPage({
    path: page.path,
    title: page.seoTitle || titleWithBrand(page.title),
    description: page.seoDescription || settings.siteDescription,
    image,
    imageAlt: altFor(image, payload, settings.siteImageAlt),
    extraGraph,
    webPageType,
    dateModified,
    identity,
    lcp: isLocalRasterSrc(image) ? { src: image, maxWidth: 800, sizes: PRIORITY_IMAGE_SIZES } : undefined
  })
}

export function adminSeo(): SeoPage {
  return buildSeoPage({
    path: '/',
    title: `Admin | ${SITE_NAME}`,
    description: 'Sign in.',
    robots: 'noindex, nofollow, noarchive'
  })
}
