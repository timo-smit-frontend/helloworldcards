import { slugify } from '~/services/utils'

export type Product = {
  id: number
  title: string
  description: string
  images: string[]
  price?: string | number
  category?: string
  slug: string
}

type ProductRecord = Omit<Product, 'slug'>

const products: ProductRecord[] = [
  {
    id: 1,
    title: 'Charizard Holo',
    description: 'Base Set - 10/102',
    images: [
      'https://storage.googleapis.com/images.pricecharting.com/0374cd52bb22be6591b9807241107c22c6f72b2f071869c6e6342a156be99e10/1600.jpg',
      'https://i.ebayimg.com/images/g/cx4AAOSwStVkIPDY/s-l400.jpg'
    ],
    price: '€249',
    category: 'Pokemon'
  },
  {
    id: 2,
    title: 'Blastoise Holo',
    description: 'Base Set - 10/102',
    images: [
      'https://storage.googleapis.com/images.pricecharting.com/0374cd52bb22be6591b9807241107c22c6f72b2f071869c6e6342a156be99e10/1600.jpg',
      'https://i.ebayimg.com/images/g/cx4AAOSwStVkIPDY/s-l400.jpg'
    ],
    price: '€189',
    category: 'Pokemon'
  },
  {
    id: 3,
    title: 'Venusaur Holo',
    description: 'Base Set - 10/102',
    images: [
      'https://storage.googleapis.com/images.pricecharting.com/0374cd52bb22be6591b9807241107c22c6f72b2f071869c6e6342a156be99e10/1600.jpg',
      'https://i.ebayimg.com/images/g/cx4AAOSwStVkIPDY/s-l400.jpg'
    ],
    price: '€159',
    category: 'Pokemon'
  },
  {
    id: 4,
    title: 'Pikachu Illustrator',
    description: 'Base Set - 10/102',
    images: [
      'https://storage.googleapis.com/images.pricecharting.com/0374cd52bb22be6591b9807241107c22c6f72b2f071869c6e6342a156be99e10/1600.jpg',
      'https://i.ebayimg.com/images/g/cx4AAOSwStVkIPDY/s-l400.jpg'
    ],
    price: '€1.200',
    category: 'Pokemon'
  },
  {
    id: 5,
    title: 'Mewtwo GX',
    description: 'Base Set - 10/102',
    images: [
      'https://storage.googleapis.com/images.pricecharting.com/0374cd52bb22be6591b9807241107c22c6f72b2f071869c6e6342a156be99e10/1600.jpg',
      'https://i.ebayimg.com/images/g/cx4AAOSwStVkIPDY/s-l400.jpg'
    ],
    price: '€79',
    category: 'Pokemon'
  },
  {
    id: 6,
    title: 'Eevee Promo',
    description: 'Base Set - 10/102',
    images: [
      'https://storage.googleapis.com/images.pricecharting.com/0374cd52bb22be6591b9807241107c22c6f72b2f071869c6e6342a156be99e10/1600.jpg',
      'https://i.ebayimg.com/images/g/cx4AAOSwStVkIPDY/s-l400.jpg'
    ],
    category: 'Pokemon'
  }
]

function withSlug(product: ProductRecord): Product {
  return { ...product, slug: slugify(product.title) }
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
  const product = products.find((item) => slugify(item.title) === slug)
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
