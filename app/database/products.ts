import { slugify } from '../services/utils'

export type Product = {
  id: number
  title: string
  subtitle: string
  description: string
  images: string[]
  pokemonId?: number
  price?: string | number
  marktplaatsUrl?: string
  slug: string
}

export type InventoryProduct = Product & {
  /** What we paid for the item, in euros. Stripped from the public shop bundle. */
  cost?: number
  /** Sold cards stay in inventory for stats and leave the public shop. */
  sold?: boolean
  /** ISO date `YYYY-MM-DD`. Required to sort and filter sales by month. */
  soldAt?: string
  /** ISO date `YYYY-MM-DD` when the card was bought. */
  acquiredAt?: string
}

type ProductRecord = Omit<Product, 'slug' | 'images'> & {
  images?: string[]
  /** Purchase price in euros. Dashboard only; stripped from the public shop bundle. */
  cost?: number
  sold?: boolean
  soldAt?: string
  acquiredAt?: string
}

const products: ProductRecord[] = [
  {
    id: 1,
    title: 'Mewtwo',
    subtitle: '2016 Evolutions - #51',
    description:
      'A reverse holo from the 2016 XY Evolutions set, number 51/108. Evolutions reprints the original Base Set art with an XY-era reverse holo finish. This copy is graded PSA 9 Mint, cert 148651617. The PSA population is 1,857.',
    images: ['/images/148651617_front.jpg', '/images/148651617_back.jpg'],
    price: '€100',
    marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436737465',
    cost: 55,
    acquiredAt: '2026-08-30'
  },
  {
    id: 2,
    title: 'Lugia V',
    subtitle: '2022 Silver Tempest - #185',
    description:
      'A Full Art from the 2022 Sword & Shield Silver Tempest set, number 185/195. This is the Full Art V, not the regular set print. This copy is graded PSA 9 Mint, cert 76719295. The PSA population is 1,254.',
    images: ['/images/76719295_front.jpg', '/images/76719295_back.jpg'],
    price: '€45',
    marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436737892',
    cost: 30,
    acquiredAt: '2026-08-30'
  },
  {
    id: 3,
    title: 'Charizard',
    subtitle: '2016 Radiant Collection - #RC5',
    description:
      'A holo from the 2016 XY Generations Radiant Collection, number RC5/RC32. Radiant Collection uses the classic Charizard art on a holographic foil. This copy is graded PSA 9 Mint, cert 61958598. The PSA population is 2,625.',
    images: ['/images/61958598_front.jpg', '/images/61958598_back.jpg'],
    pokemonId: 6,
    price: '€125',
    marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436738233',
    cost: 75,
    acquiredAt: '2026-08-30'
  },
  {
    id: 4,
    title: 'Ekans',
    subtitle: '2000 Team Rocket - #56',
    description:
      'A 1st Edition from the 2000 Team Rocket set, number 56/82. The 1st Edition stamp is on the original Wizards of the Coast print. This copy is graded PSA 9 Mint, cert 76645522. The PSA population is 879.',
    images: ['/images/76645522_front.jpg', '/images/76645522_back.jpg'],
    pokemonId: 23,
    price: '€60',
    marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436738700',
    cost: 25,
    acquiredAt: '2026-08-30'
  },
  {
    id: 5,
    title: 'Zorua AR',
    subtitle: '2025 White Flare Japanese - #140',
    description:
      'An Art Rare from the 2025 Scarlet & Violet White Flare Japanese set, number 140/086. Art Rares are the full-illustration prints from the Japanese set. This copy was graded BGS 9.5 Gem Mint on 3 September 2025, cert 18501427. Subgrades are centering 9.5, corners 10, edges 10, and surface 9.5. The Beckett population is 35.',
    images: ['/images/0018501427_front.jpg', '/images/0018501427_back.jpg'],
    pokemonId: 570,
    price: '€70',
    marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436896724',
    cost: 40,
    acquiredAt: '2026-08-30'
  }
]

function baseSlug(product: ProductRecord): string {
  return slugify(`${product.title} ${product.subtitle}`)
}

function productSlug(product: ProductRecord): string {
  const base = baseSlug(product)
  const takenByEarlier = products.some((other) => other.id < product.id && baseSlug(other) === base)
  return takenByEarlier ? `${base}-${product.id}` : base
}

function withSlug(product: ProductRecord): Product {
  const publicProduct = { ...product, images: product.images ?? [], slug: productSlug(product) }
  delete publicProduct.cost
  delete publicProduct.sold
  delete publicProduct.soldAt
  delete publicProduct.acquiredAt
  return publicProduct
}

export function isShopListed(product: Pick<InventoryProduct, 'sold'>): boolean {
  return product.sold !== true
}

function withInventory(product: ProductRecord): InventoryProduct {
  const publicProduct = withSlug(product)
  return {
    ...publicProduct,
    ...(product.cost != null ? { cost: product.cost } : {}),
    ...(product.sold ? { sold: true } : {}),
    ...(product.soldAt ? { soldAt: product.soldAt } : {}),
    ...(product.acquiredAt ? { acquiredAt: product.acquiredAt } : {})
  }
}

export function getInventory(): InventoryProduct[] {
  return products.map(withInventory)
}

export function getAllProducts(): Product[] {
  return products.filter(isShopListed).map(withSlug)
}

export function getProductsByIds(ids: Array<string | number>): Product[] {
  const byId = new Map(products.filter(isShopListed).map((product) => [String(product.id), product]))

  return ids
    .map((id) => byId.get(String(id)))
    .filter((product): product is ProductRecord => product != null)
    .map(withSlug)
}

export function getProductBySlug(slug: string): Product | undefined {
  const product = products.find((item) => productSlug(item) === slug)
  return product && isShopListed(product) ? withSlug(product) : undefined
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

export function getRandomProducts(count = 4): Product[] {
  return shuffle(products.filter(isShopListed)).slice(0, count).map(withSlug)
}

export function getSimilarProducts(excludeId: number, count = 4): Product[] {
  return shuffle(products.filter((product) => product.id !== excludeId && isShopListed(product)))
    .slice(0, count)
    .map(withSlug)
}
