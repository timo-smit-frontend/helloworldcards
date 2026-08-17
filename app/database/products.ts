import { slugify } from '../services/utils'

export type Product = {
  id: number
  title: string
  subtitle: string
  description: string
  images: string[]
  price?: string | number
  marktplaatsUrl?: string
  slug: string
}

type ProductRecord = Omit<Product, 'slug'>

const products: ProductRecord[] = [
  {
    id: 1,
    title: 'Mewtwo Reverse Holo',
    subtitle: '2016 XY Evolutions - 51/108',
    description:
      'Reverse holo Mewtwo from the 2016 XY Evolutions set, number 51/108. Graded PSA 9 Mint. Email us if you want the details, or use the Marktplaats listing when one is up.',
    images: ['/images/148651617_front.jpg', '/images/148651617_back.jpg'],
    price: '€99'
  },
  {
    id: 2,
    title: 'Blastoise Holo',
    subtitle: 'Base Set - Reverse Holo - 10/102',
    description:
      'A reverse holo Blastoise from Base Set. Classic art, the kind of card that still earns a page in the binder. Listed here and on Marktplaats.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€189'
  },
  {
    id: 3,
    title: 'Venusaur Holo',
    subtitle: 'Base Set - 10/102',
    description: 'Holo Venusaur from Base Set. A grass-type staple with the original full-art energy, listed here and on Marktplaats.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€159'
  },
  {
    id: 4,
    title: 'Pikachu Illustrator',
    subtitle: 'Base Set - 10/102',
    description: 'Pikachu Illustrator, a display piece from the shop. Ask us if you want a closer look.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€1.200'
  },
  {
    id: 5,
    title: 'Mewtwo GX',
    subtitle: 'Base Set - 10/102',
    description: 'Mewtwo GX from the shop. A later-era hit that still pulls focus in a binder. Same listing as on Marktplaats.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€79'
  },
  {
    id: 6,
    title: 'Eevee Promo',
    subtitle: 'Base Set - 10/102',
    description: "An Eevee promo with the soft art people pick up and don't put back. Message us if you want it.",
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png']
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
  return { ...product, slug: productSlug(product) }
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
