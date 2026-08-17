import { getUpcomingEvents } from '../database/events'
import { getAllFaqs } from '../database/faq'
import { getAllProducts } from '../database/products'
import { CONTACT_EMAIL } from '../services/contact'
import { getSeoForPath } from './pages'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from './site'

const PAGE_PATHS = ['/', '/products', '/agenda', '/about', '/contact'] as const

function canonicalUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`
}

function pageName(path: string): string {
  if (path === '/') return 'Home'
  const seo = getSeoForPath(path)
  return seo.title.replace(` | ${SITE_NAME}`, '')
}

function introMarkdown(): string {
  return [
    `# ${SITE_NAME}`,
    `> ${SITE_DESCRIPTION}`,
    '',
    `${SITE_NAME} is a small Pokémon card and art shop run by Sam and Timo. We sell online and at events in the Netherlands and Belgium. To buy a card, email ${CONTACT_EMAIL} or use the contact form.`
  ].join('\n')
}

function pagesSection(): string {
  const items = PAGE_PATHS.map((path) => {
    const seo = getSeoForPath(path)
    return `- [${pageName(path)}](${canonicalUrl(path)}): ${seo.description}`
  })

  return ['## Pages', ...items].join('\n')
}

function productsSection(full: boolean): string {
  const items = getAllProducts().map((product) => {
    const url = canonicalUrl(`/products/${product.slug}`)
    const bits = [product.subtitle, product.price != null ? String(product.price) : null].filter(Boolean)
    const summary = bits.join('. ')
    const detail = full && product.description ? `${summary}. ${product.description}` : summary

    return `- [${product.title}](${url}): ${detail}`
  })

  return ['## Products', ...items].join('\n')
}

function eventsSection(): string {
  const events = getUpcomingEvents()
  const agendaUrl = canonicalUrl('/agenda')

  if (!events.length) {
    return `## Events\n- [Upcoming events](${agendaUrl}): No upcoming events listed right now.`
  }

  const items = events.map((event) => `- [${event.title}](${agendaUrl}): ${event.date}, ${event.location}`)

  return ['## Events', ...items].join('\n')
}

function faqSection(): string {
  const items = getAllFaqs().flatMap((item) => [`### ${item.question}`, item.answer, ''])

  return ['## FAQ', ...items].join('\n').trimEnd()
}

function optionalSection(): string {
  const seo = getSeoForPath('/privacy')

  return `## Optional\n- [Privacy statement](${canonicalUrl('/privacy')}): ${seo.description}`
}

export function buildLlmsTxt(): string {
  return [introMarkdown(), pagesSection(), productsSection(false), eventsSection(), optionalSection()].join('\n\n') + '\n'
}

export function buildLlmsFullTxt(): string {
  return [introMarkdown(), pagesSection(), faqSection(), productsSection(true), eventsSection(), optionalSection()].join('\n\n') + '\n'
}
