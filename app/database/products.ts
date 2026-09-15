import { slugify } from '../services/utils'

export const CARD_LANGUAGES = ['english', 'japanese'] as const
export const CARD_GRADERS = ['psa', 'beckett'] as const

export type CardLanguage = (typeof CARD_LANGUAGES)[number]
export type CardGrader = (typeof CARD_GRADERS)[number]

export type Product = {
  id: number
  title: string
  subtitle: string
  description: string
  images: string[]
  pokemonId?: number
  price?: string | number
  language?: CardLanguage
  grader?: CardGrader
  year?: number
  marktplaatsUrl?: string
  vintedUrl?: string
  /**
   * Sold, but still on its way and not paid out yet. The card stays in the shop without a
   * price or buy link, saying it is reserved, until the money is in and it becomes `sold`.
   */
  reserved?: boolean
  slug: string
}

export type InventoryProduct = Product & {
  /** What we paid for the item, in euros. Stripped from the public shop bundle. */
  cost?: number
  /** Sold cards stay in inventory for stats and leave the public shop. Set with soldAt; set `price` to the actual sale amount. */
  sold?: boolean
  /** On the shop but not listed on Marktplaats yet. Stripped from the public shop bundle. */
  concept?: boolean
  /** ISO date `YYYY-MM-DD`. Required to sort and filter sales by month. */
  soldAt?: string
  /** ISO date `YYYY-MM-DD` when the card was bought. */
  acquiredAt?: string
  /** Numeric slab grade (9, 9.5, 10). Dashboard Cardmarket comps only. */
  grade?: number
  /** Cardmarket singles URL. Dashboard comps only; stripped from the public shop bundle. */
  cardmarketUrl?: string
  /** Cardmarket Reverse Holo filter. Dashboard comps only. */
  reverseHolo?: boolean
  /** Cardmarket First Edition filter. Dashboard comps only. */
  firstEdition?: boolean
}

type ProductBuyLink = {
  title: string
  url?: string
  target?: '_blank'
}

export function productBuyLink(product: Pick<Product, 'marktplaatsUrl' | 'vintedUrl' | 'reserved'>): ProductBuyLink {
  // The ads are still up, marked reserved, but there is nothing left to buy.
  if (product.reserved) {
    return { title: 'This card is reserved' }
  }

  if (product.marktplaatsUrl) {
    return { url: product.marktplaatsUrl, title: 'View on Marktplaats', target: '_blank' }
  }

  if (product.vintedUrl) {
    return { url: product.vintedUrl, title: 'View on Vinted', target: '_blank' }
  }

  return { title: 'Not yet available to buy' }
}

export type ProductRecord = Omit<Product, 'slug' | 'images'> & {
  images?: string[]
  cost?: number
  sold?: boolean
  reserved?: boolean
  concept?: boolean
  soldAt?: string
  acquiredAt?: string
  grade?: number
  cardmarketUrl?: string
  reverseHolo?: boolean
  firstEdition?: boolean
}

function productSlugBase(product: Pick<ProductRecord, 'title' | 'subtitle'>): string {
  return slugify(`${product.title} ${product.subtitle}`)
}

export function uniqueProductSlug(product: ProductRecord, earlier: ProductRecord[]): string {
  const base = productSlugBase(product)
  const takenByEarlier = earlier.some((other) => other.id < product.id && productSlugBase(other) === base)
  return takenByEarlier ? `${base}-${product.id}` : base
}

export function toPublicProduct(product: ProductRecord, slug: string): Product {
  return {
    id: product.id,
    title: product.title,
    subtitle: product.subtitle,
    description: product.description,
    images: product.images ?? [],
    slug,
    ...(product.pokemonId != null ? { pokemonId: product.pokemonId } : {}),
    ...(product.price != null ? { price: product.price } : {}),
    ...(product.language ? { language: product.language } : {}),
    ...(product.grader ? { grader: product.grader } : {}),
    ...(product.year != null ? { year: product.year } : {}),
    ...(product.marktplaatsUrl ? { marktplaatsUrl: product.marktplaatsUrl } : {}),
    ...(product.vintedUrl ? { vintedUrl: product.vintedUrl } : {}),
    ...(product.reserved ? { reserved: true } : {})
  }
}

export function toInventoryProduct(product: ProductRecord, slug: string): InventoryProduct {
  return {
    ...toPublicProduct(product, slug),
    ...(product.cost != null ? { cost: product.cost } : {}),
    ...(product.sold ? { sold: true } : {}),
    ...(product.soldAt ? { soldAt: product.soldAt } : {}),
    ...(product.acquiredAt ? { acquiredAt: product.acquiredAt } : {}),
    ...(product.concept ? { concept: true } : {}),
    ...(product.grade != null ? { grade: product.grade } : {}),
    ...(product.cardmarketUrl ? { cardmarketUrl: product.cardmarketUrl } : {}),
    ...(product.reverseHolo ? { reverseHolo: true } : {}),
    ...(product.firstEdition ? { firstEdition: true } : {})
  }
}

/** Reserved cards stay listed — the shop shows them as reserved — and only a settled sale takes a card off. */
export function isShopListed(product: Pick<InventoryProduct, 'sold' | 'reserved'>): boolean {
  return product.sold !== true
}
