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
  /** Purchase price in euros. Private till only; stripped from the public shop bundle. */
  cost?: number
}

const products: ProductRecord[] = [
  {
    id: 1,
    title: 'Mewtwo Reverse Holo',
    subtitle: '2016 XY Evolutions - 51/108',
    description:
      'Reverse holo Mewtwo from the 2016 XY Evolutions set, number 51/108. Graded PSA 9 Mint. Email us if you want the details, or use the Marktplaats listing when one is up.',
    images: ['/images/148651617_front.jpg', '/images/148651617_back.jpg'],
    price: '€99',
    cost: 55
  },
  {
    id: 2,
    title: 'Blastoise Holo',
    subtitle: 'Base Set - Reverse Holo - 10/102',
    description:
      'A reverse holo Blastoise from Base Set. Classic art, the kind of card that still earns a page in the binder. Listed here and on Marktplaats.',
    pokemonId: 9,
    price: '€189',
    cost: 110
  },
  {
    id: 3,
    title: 'Venusaur Holo',
    subtitle: 'Base Set - 10/102',
    description: 'Holo Venusaur from Base Set. A grass-type staple with the original full-art energy, listed here and on Marktplaats.',
    pokemonId: 3,
    price: '€159',
    cost: 90
  },
  {
    id: 4,
    title: 'Pikachu Illustrator',
    subtitle: 'Base Set - 10/102',
    description: 'Pikachu Illustrator, a display piece from the shop. Ask us if you want a closer look.',
    pokemonId: 25,
    price: '€1.200',
    cost: 750
  },
  {
    id: 5,
    title: 'Mewtwo GX',
    subtitle: 'Base Set - 10/102',
    description: 'Mewtwo GX from the shop. A later-era hit that still pulls focus in a binder. Same listing as on Marktplaats.',
    pokemonId: 150,
    price: '€79',
    cost: 40
  },
  {
    id: 6,
    title: 'Eevee Promo',
    subtitle: 'Base Set - 10/102',
    description: "An Eevee promo with the soft art people pick up and don't put back.",
    pokemonId: 133,
    cost: 18
  },
  {
    id: 7,
    title: 'Psyduck Binder',
    subtitle: 'Custom handpainted',
    description: 'A custom handpainted binder for Psyduck.',
    pokemonId: 54,
    cost: 35
  },
  {
    id: 8,
    title: 'Slowpoke Binder',
    subtitle: 'Custom handpainted',
    description: 'A custom handpainted binder for Slowpoke.',
    pokemonId: 79,
    cost: 35
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
