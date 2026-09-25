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

/** What a sold card's old address says, on the page and to crawlers alike. */
export function soldProductCopy(product: PublicSoldProduct): { title: string; description: string } {
  return {
    title: `${product.title} has sold`,
    description: `This ${product.title} (${product.subtitle}) has found a new owner. The cards below are still for sale.`
  }
}

export function soldProductSeoDescription(product: PublicSoldProduct): string {
  return `${productName(product)} has sold. See the graded Pokémon cards that are still for sale at Hello World Cards.`
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
