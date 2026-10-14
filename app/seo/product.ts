import type { PublicProduct, PublicSoldProduct } from '../cms/types'
import { productBuyLink, type CardGrader, type CardLanguage } from '../database/products'
import { parseListedPrice } from '../services/price'
import { SITE_URL, canonicalUrl, toAbsoluteUrl } from './site'

const GRADER_LABELS: Record<CardGrader, string> = { psa: 'PSA', beckett: 'BGS' }
const LANGUAGE_LABELS: Record<CardLanguage, string> = { english: 'English', japanese: 'Japanese' }

/** Search results cut a description off at about this many characters. */
const DESCRIPTION_LENGTH = 160

type GradedCard = Pick<PublicProduct, 'grader' | 'grade'>

export function languageLabel(language: CardLanguage | undefined): string {
  return language ? LANGUAGE_LABELS[language] : ''
}

/** `PSA 9`, `BGS 9.5`, or nothing when the record does not say. */
export function gradeLabel(product: GradedCard): string {
  return product.grader && product.grade != null ? `${GRADER_LABELS[product.grader]} ${product.grade}` : ''
}

/** The card as buyers search for it: `Zorua AR BGS 9.5`. */
export function productHeadline(product: Pick<PublicProduct, 'title'> & GradedCard): string {
  return [product.title, gradeLabel(product)].filter(Boolean).join(' ')
}

/** `2016 Evolutions - #51` reads as `2016 Evolutions #51` in a title. */
export function productSetLine(subtitle: string): string {
  return subtitle.replace(/\s+-\s+#/, ' #').trim()
}

/** `Mewtwo PSA 9 - 2016 Evolutions #51`: the Marktplaats title order, name and grade first. */
export function productName(product: Pick<PublicProduct, 'title' | 'subtitle'> & GradedCard): string {
  const set = productSetLine(product.subtitle)
  return set ? `${productHeadline(product)} - ${set}` : productHeadline(product)
}

function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
}

/** Whole sentences only, as many as fit; the lead always stays, however long. */
function fitSentences(lead: string, text: string, limit = DESCRIPTION_LENGTH): string {
  let result = lead
  for (const sentence of sentences(text)) {
    const next = `${result} ${sentence}`
    if (next.length > limit) break
    result = next
  }
  return result
}

function priceLabel(product: Pick<PublicProduct, 'price'>): string | null {
  const euros = parseListedPrice(product.price)
  return euros == null ? null : `€${Number.isInteger(euros) ? euros : euros.toFixed(2)}`
}

/** Name, grade, set and price up front, then as much of the card's own story as fits. */
export function productSeoDescription(product: PublicProduct): string {
  const price = product.reserved ? 'reserved' : priceLabel(product)
  const lead = [productHeadline(product), productSetLine(product.subtitle), price ? (product.reserved ? price : `for ${price}`) : null]
    .filter(Boolean)
    .join(', ')
  return fitSentences(`${lead}.`, product.description)
}

/** A sold card's page says what it was the same way, sold where the price would be. */
export function soldProductSeoDescription(product: PublicSoldProduct): string {
  const lead = [productHeadline(product), productSetLine(product.subtitle), 'sold'].filter(Boolean).join(', ')
  return fitSentences(`${lead}.`, product.description)
}

/** The button a sold card's page offers instead of a listing. */
export const SOLD_PRODUCT_LINK = { url: '/products/', title: 'See all cards for sale' }

export type ProductAboutSection = { title: string; body: string }

/** The heading over a card's story: `About this Ekans`. */
export function productAboutTitle(product: Pick<PublicProduct, 'title'>): string {
  return `About this ${product.title}`
}

/**
 * A card's story as the sections it is written in. A `## Heading` line starts a section;
 * text before the first one is a section of its own, without a heading.
 */
export function productAboutSections(about: string | undefined): ProductAboutSection[] {
  const sections: ProductAboutSection[] = []
  let current: ProductAboutSection = { title: '', body: '' }
  for (const line of (about ?? '').split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      sections.push(current)
      current = { title: heading[1], body: '' }
    } else {
      current.body += `${line}\n`
    }
  }
  sections.push(current)
  return sections.map((section) => ({ title: section.title, body: section.body.trim() })).filter((section) => section.title || section.body)
}

function additionalProperties(product: PublicProduct): Array<Record<string, unknown>> {
  const facts: Array<[string, string | number | undefined]> = [
    ['Grade', gradeLabel(product)],
    ['Language', languageLabel(product.language)],
    ['Year', product.year]
  ]
  return facts.filter(([, value]) => value != null && value !== '').map(([name, value]) => ({ '@type': 'PropertyValue', name, value }))
}

/**
 * Schema.org Product with its Offer, for search engines' product results.
 *
 * Only a card with a price on its page gets one: a reserved card shows no price, and a
 * Product without an offer is an error in Search Console. A card that is on the site but
 * not listed yet says so on its page, so its offer is out of stock until the listing is up.
 * A graded card is opened, graded and sold on, which is "used" in Google's own terms.
 */
export function productJsonLd(product: PublicProduct): Record<string, unknown> | null {
  const euros = parseListedPrice(product.price)
  if (product.reserved || euros == null) {
    return null
  }

  const url = canonicalUrl(`/products/${product.slug}`)
  const buyable = productBuyLink(product).url != null
  const properties = additionalProperties(product)

  return {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: productName(product),
    description: product.description,
    url,
    sku: String(product.id),
    ...(product.images.length ? { image: product.images.map(toAbsoluteUrl) } : {}),
    brand: { '@type': 'Brand', name: 'Pokémon' },
    ...(properties.length ? { additionalProperty: properties } : {}),
    offers: {
      '@type': 'Offer',
      url,
      price: euros.toFixed(2),
      priceCurrency: 'EUR',
      availability: buyable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/UsedCondition',
      seller: { '@id': `${SITE_URL}/#organization` }
    }
  }
}
