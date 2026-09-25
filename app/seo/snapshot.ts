import { FEATURED_PRODUCT_COUNT, type CmsBlock, type CmsEvent, type PublicCmsPayload, type PublicProduct } from '../cms/types'
import { productBuyLink } from '../database/products'
import { escapeHtml } from './head'
import { gradeLabel, languageLabel, productName, productSetLine, soldProductCopy } from './product'
import { SITE_NAME } from './site'

/**
 * The page as plain HTML, written into the empty `#root` of the shell.
 *
 * The site renders in the browser, so a crawler that does not run JavaScript — ChatGPT's,
 * Perplexity's and Claude's search crawlers among them — used to find an empty body and
 * not one link to follow. This gives them the same words and links the app shows. People
 * never see it: it is visually hidden, and React clears it on its first render. Images are
 * left out so the browser does not fetch pictures nobody will look at.
 */
const HIDDEN_STYLE =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

const EMPTY_ROOT = /<div id="root">\s*<\/div>/

type Headings = () => 'h1' | 'h2'

/** The first heading on the page is its h1, every later one an h2. */
function headings(): Headings {
  let used = false
  return () => {
    const level = used ? 'h2' : 'h1'
    used = true
    return level
  }
}

function heading(level: 'h1' | 'h2' | 'h3', text: string | undefined): string {
  return text ? `<${level}>${escapeHtml(text)}</${level}>` : ''
}

function link(url: string | undefined, title: string | undefined): string {
  return url && title ? `<p><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></p>` : ''
}

/** The CMS's inline markdown (`**bold**`, `[text](url)`), as `~/cms/markdown` renders it. */
function inlineMarkdown(text: string): string {
  return text
    .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
    .map((part) => {
      const bold = part.match(/^\*\*([^*]+)\*\*$/)
      if (bold) return `<strong>${escapeHtml(bold[1])}</strong>`
      const anchor = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (anchor) return `<a href="${escapeHtml(anchor[2])}">${escapeHtml(anchor[1])}</a>`
      return escapeHtml(part)
    })
    .join('')
}

function markdown(text: string | undefined): string {
  if (!text?.trim()) return ''
  return text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${inlineMarkdown(paragraph.replace(/\n/g, ' '))}</p>`)
    .join('')
}

function productStatus(product: PublicProduct): string {
  if (product.reserved) return 'reserved'
  return product.price != null ? String(product.price) : ''
}

function productList(products: PublicProduct[]): string {
  if (!products.length) return ''
  const items = products.map((product) => {
    const status = productStatus(product)
    return `<li><a href="/products/${escapeHtml(product.slug)}/">${escapeHtml(productName(product))}</a>${status ? `, ${escapeHtml(status)}` : ''}</li>`
  })
  return `<ul>${items.join('')}</ul>`
}

function eventList(events: CmsEvent[]): string {
  if (!events.length) return '<p>No next event planned yet.</p>'
  const items = events.map(
    (event) =>
      `<li>${escapeHtml(event.title)}, <time datetime="${escapeHtml(event.date)}">${escapeHtml(event.date)}</time>, ${escapeHtml(event.location)}</li>`
  )
  return `<ul>${items.join('')}</ul>`
}

function byIds<T extends { id: number }>(items: T[], ids: number[] | undefined): T[] {
  if (!ids?.length) return []
  const byId = new Map(items.map((item) => [item.id, item]))
  return ids.map((id) => byId.get(id)).filter((item): item is T => item != null)
}

function blockHtml(block: CmsBlock, payload: PublicCmsPayload, next: Headings): string {
  switch (block.type) {
    case 'banner_figcaption':
      return heading(next(), block.title || block.srTitle) + markdown(block.description) + link(block.link?.url, block.link?.title)
    case 'content_text':
      return (
        heading(next(), block.title || block.srTitle) +
        markdown(block.description) +
        (block.sections ?? []).map((section) => heading('h3', section.title) + markdown(section.body)).join('') +
        link(block.link?.url, block.link?.title)
      )
    case 'content_cta':
      return heading(next(), block.title) + markdown(block.description) + link(block.link?.url, block.link?.title)
    case 'content_products': {
      // The featured slots on the home page are an invitation to buy: never a reserved card.
      const products = block.random
        ? payload.products.filter((product) => !product.reserved).slice(0, FEATURED_PRODUCT_COUNT)
        : payload.products
      return heading(next(), block.title) + markdown(block.description) + productList(products)
    }
    case 'content_agenda':
      return heading(next(), block.title) + markdown(block.description) + eventList(byIds(payload.events, block.eventIds))
    case 'content_faq': {
      const faqs = byIds(payload.faqs, block.faqIds)
      if (!faqs.length) return ''
      return (
        heading(next(), block.title || 'Frequently asked questions') +
        faqs.map((faq) => heading('h3', faq.question) + markdown(faq.answer)).join('')
      )
    }
    case 'content_about':
      return (
        heading(next(), block.title) +
        markdown(block.description) +
        block.people.map((person) => heading('h3', person.name) + markdown(person.description)).join('')
      )
    case 'form_contact': {
      const email = payload.settings.contactEmail
      return (
        heading(next(), block.title || 'Contact') +
        markdown(block.description) +
        `<p>Email: <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>`
      )
    }
  }
}

function productHtml(product: PublicProduct, payload: PublicCmsPayload): string {
  const buy = productBuyLink(product)
  const facts: Array<[string, string]> = [
    ['Card', productSetLine(product.subtitle)],
    ['Grade', gradeLabel(product)],
    ['Language', languageLabel(product.language)],
    ['Year', product.year != null ? String(product.year) : ''],
    [product.reserved ? 'Status' : 'Price', productStatus(product)]
  ]
  const details = facts
    .filter(([, value]) => value)
    .map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('')
  const buyLinks = product.reserved
    ? `<p>${escapeHtml(buy.title)}</p>`
    : [
        product.marktplaatsUrl ? link(product.marktplaatsUrl, 'View on Marktplaats') : '',
        product.vintedUrl ? link(product.vintedUrl, 'View on Vinted') : ''
      ].join('') || `<p>${escapeHtml(buy.title)}</p>`

  return (
    `<article>${heading('h1', productName(product))}${markdown(product.description)}<dl>${details}</dl>${buyLinks}</article>` +
    `<section>${heading('h2', 'More from the shop')}${productList(byIds(payload.products, payload.similarProductIds))}</section>`
  )
}

function mainHtml(payload: PublicCmsPayload): string {
  if (payload.product) {
    return productHtml(payload.product, payload)
  }

  if (payload.soldProduct) {
    const copy = soldProductCopy(payload.soldProduct)
    return (
      heading('h1', copy.title) +
      markdown(copy.description) +
      link('/products/', 'See all cards for sale') +
      `<section>${heading('h2', 'Still for sale')}${productList(byIds(payload.products, payload.similarProductIds))}</section>`
    )
  }

  if (payload.notFound || !payload.page) {
    const settings = payload.settings
    return heading('h1', settings.notFoundTitle) + markdown(settings.notFoundDescription) + link('/', settings.notFoundCta)
  }

  const next = headings()
  return payload.page.blocks.map((block) => blockHtml(block, payload, next)).join('')
}

export function buildPageSnapshot(payload: PublicCmsPayload | null): string {
  if (!payload) return ''

  const settings = payload.settings
  const nav = payload.nav.header.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`).join('')
  const contact = [
    `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeHtml(settings.contactEmail)}</a>`,
    `<a href="${escapeHtml(settings.instagramUrl)}">Instagram</a>`,
    `<a href="${escapeHtml(settings.marktplaatsUrl)}">Marktplaats</a>`
  ].join(' · ')

  return (
    `<div data-snapshot style="${HIDDEN_STYLE}">` +
    `<header><a href="/">${escapeHtml(SITE_NAME)}</a>${nav ? `<nav><ul>${nav}</ul></nav>` : ''}</header>` +
    `<main>${mainHtml(payload)}</main>` +
    `<footer><p>${contact}</p></footer>` +
    `</div>`
  )
}

/** Writes the snapshot into the shell's empty `#root`; a shell without one is left as it is. */
export function applyPageSnapshot(html: string, snapshot: string): string {
  if (!snapshot) return html
  return html.replace(EMPTY_ROOT, () => `<div id="root">${snapshot}</div>`)
}
