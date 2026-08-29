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
}

type ProductRecord = Omit<Product, 'slug' | 'images'> & {
  images?: string[]
  /** Purchase price in euros. Dashboard only; stripped from the public shop bundle. */
  cost?: number
}

const products: ProductRecord[] = [
  {
    id: 1,
    title: 'Mewtwo',
    subtitle: '2016 Evolutions - #51',
    description:
      'Reverse foil Mewtwo from XY Evolutions, number 51/108. Graded PSA 9 Mint. Email us if you want the details, or use the Marktplaats listing when one is up.',
    images: ['/images/148651617_front.jpg', '/images/148651617_back.jpg'],
    price: '€100',
    cost: 55
  },
  {
    id: 2,
    title: 'Lugia V',
    subtitle: '2022 Silver Tempest - #185',
    description:
      'Full art Lugia V from Sword & Shield Silver Tempest, number 185/195. Graded PSA 9 Mint. Email us if you want the details, or use the Marktplaats listing when one is up.',
    images: ['/images/76719295_front.jpg', '/images/76719295_back.jpg'],
    price: '€45',
    cost: 30
  },
  {
    id: 3,
    title: 'Charizard',
    subtitle: '2016 Radiant Collection - #RC5',
    description:
      'Holo Charizard from the XY Generations Radiant Collection, number RC5/RC32. Graded PSA 9 Mint. Email us if you want the details, or use the Marktplaats listing when one is up.',
    images: ['/images/61958598_front.jpg', '/images/61958598_back.jpg'],
    pokemonId: 6,
    price: '€125',
    cost: 75
  },
  {
    id: 4,
    title: 'Ekans',
    subtitle: '2000 Team Rocket - #56',
    description:
      '1st Edition Ekans from Team Rocket, number 56/82. Graded PSA 9 Mint. Email us if you want the details, or use the Marktplaats listing when one is up.',
    images: ['/images/76645522_front.jpg', '/images/76645522_back.jpg'],
    pokemonId: 23,
    price: '€40',
    cost: 25
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
  return publicProduct
}

function withInventory(product: ProductRecord): InventoryProduct {
  const publicProduct = withSlug(product)
  return product.cost == null ? publicProduct : { ...publicProduct, cost: product.cost }
}

export function getInventory(): InventoryProduct[] {
  return products.map(withInventory)
}

export function getAllProducts(): Product[] {
  return products.map(withSlug)
}

export function getProductsByIds(ids: Array<string | number>): Product[] {
  const byId = new Map(products.map((product) => [String(product.id), product]))

  return ids
    .map((id) => byId.get(String(id)))
    .filter((product): product is ProductRecord => product != null)
    .map(withSlug)
}

export function getProductBySlug(slug: string): Product | undefined {
  const product = products.find((item) => productSlug(item) === slug)
  return product ? withSlug(product) : undefined
}

export function getSimilarProducts(excludeId: number, count = 4): Product[] {
  const pool = products.filter((product) => product.id !== excludeId)
  const shuffled = [...pool]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled.slice(0, count).map(withSlug)
}
