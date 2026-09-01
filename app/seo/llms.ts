import { CONTACT_EMAIL, MARKTPLAATS_URL } from '../services/contact'
import { SITE_DESCRIPTION, SITE_NAME, canonicalUrl } from './site'

export type LlmsPage = {
  path: string
  title: string
  seoTitle: string
  seoDescription: string
}

export type LlmsProduct = {
  title: string
  slug: string
  subtitle: string
  price?: string | number
  description: string
}

export type LlmsEvent = {
  title: string
  date: string
  location: string
}

export type LlmsFaq = {
  question: string
  answer: string
}

export type LlmsInput = {
  siteName: string
  siteDescription: string
  contactEmail: string
  marktplaatsUrl: string
  pages: LlmsPage[]
  products: LlmsProduct[]
  events: LlmsEvent[]
  faqs: LlmsFaq[]
}

const PAGE_ORDER = ['/', '/products', '/agenda', '/about', '/contact']

function pageName(page: LlmsPage, siteName: string): string {
  if (page.path === '/') return 'Home'
  const suffix = ` | ${siteName}`
  if (page.seoTitle.endsWith(suffix)) return page.seoTitle.slice(0, -suffix.length)
  return page.title
}

function sortPages(pages: LlmsPage[]): LlmsPage[] {
  return [...pages].sort((a, b) => {
    const ai = PAGE_ORDER.indexOf(a.path)
    const bi = PAGE_ORDER.indexOf(b.path)
    if (ai === -1 && bi === -1) return a.path.localeCompare(b.path)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function introMarkdown(input: LlmsInput): string {
  return [
    `# ${input.siteName}`,
    `> ${input.siteDescription}`,
    '',
    `${input.siteName} is a small Pokémon shop run by Sam and Timo. We list cards here and on Marktplaats (${input.marktplaatsUrl}), the same stock in both places. Sam paints custom binders that we show on the site and sell in person at events. Email ${input.contactEmail} about a card, an event, or anything else.`
  ].join('\n')
}

export function buildLlmsDocument(input: LlmsInput, full = false): string {
  const privacy = input.pages.find((page) => page.path === '/privacy')
  const pages = sortPages(input.pages.filter((page) => page.path !== '/privacy'))
  const pageLines = pages.map((page) => `- [${pageName(page, input.siteName)}](${canonicalUrl(page.path)}): ${page.seoDescription}`)
  const productLines = input.products.map((product) => {
    const url = canonicalUrl(`/products/${product.slug}`)
    const bits = [product.subtitle, product.price != null ? String(product.price) : null].filter(Boolean)
    const summary = bits.join('. ')
    const detail = full && product.description ? `${summary}. ${product.description}` : summary
    return `- [${product.title}](${url}): ${detail}`
  })
  const agendaUrl = canonicalUrl('/agenda')
  const eventLines = input.events.length
    ? input.events.map((event) => `- [${event.title}](${agendaUrl}): ${event.date}, ${event.location}`)
    : [`- [Upcoming events](${agendaUrl}): No next event planned yet.`]
  const faqSection = full ? ['## FAQ', ...input.faqs.flatMap((item) => [`### ${item.question}`, item.answer, ''])].join('\n').trimEnd() : ''
  const optional = privacy ? `## Optional\n- [Privacy statement](${canonicalUrl(privacy.path)}): ${privacy.seoDescription}` : ''

  return (
    [
      introMarkdown(input),
      ['## Pages', ...pageLines].join('\n'),
      ...(faqSection ? [faqSection] : []),
      ['## Products', ...productLines].join('\n'),
      ['## Events', ...eventLines].join('\n'),
      ...(optional ? [optional] : [])
    ].join('\n\n') + '\n'
  )
}

export function buildLlmsTxt(): string {
  return buildLlmsDocument({
    siteName: SITE_NAME,
    siteDescription: SITE_DESCRIPTION,
    contactEmail: CONTACT_EMAIL,
    marktplaatsUrl: MARKTPLAATS_URL,
    pages: [],
    products: [],
    events: [],
    faqs: []
  })
}

export function buildLlmsFullTxt(): string {
  return buildLlmsTxt()
}
