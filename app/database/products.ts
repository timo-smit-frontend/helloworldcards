import { slugify } from '../services/utils'

export type Product = {
  id: number
  title: string
  subtitle: string
  description: string
  images: string[]
  price?: string | number
  slug: string
}

type ProductRecord = Omit<Product, 'slug'>

const products: ProductRecord[] = [
  {
    id: 1,
    title: 'Mewtwo Reverse Holo',
    subtitle: '2016 XY Evolutions - 51/108',
    description:
      'This Mewtwo Reverse Foil #51 is from the popular 2016 Pokémon XY Evolutions set. Professionally graded by PSA, the card received an impressive PSA 9 MINT grade.',
    images: ['/images/148651617_front.jpg', '/images/148651617_back.jpg'],
    price: '€99'
  },
  {
    id: 2,
    title: 'Blastoise Holo',
    subtitle: 'Base Set - Reverse Holo - 10/102',
    description:
      'This Blastoise Reverse Holo #10 is from the popular 2016 Pokémon Base Set. Professionally graded by PSA, the card received an impressive PSA 9 MINT grade.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€189'
  },
  {
    id: 3,
    title: 'Venusaur Holo',
    subtitle: 'Base Set - 10/102',
    description:
      'This Venusaur Reverse Holo #10 is from the popular 2016 Pokémon Base Set. Professionally graded by PSA, the card received an impressive PSA 9 MINT grade.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€159'
  },
  {
    id: 4,
    title: 'Pikachu Illustrator',
    subtitle: 'Base Set - 10/102',
    description:
      'This Pikachu Illustrator #10 is from the popular 2016 Pokémon Base Set. Professionally graded by PSA, the card received an impressive PSA 9 MINT grade.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€1.200'
  },
  {
    id: 5,
    title: 'Mewtwo GX',
    subtitle: 'Base Set - 10/102',
    description:
      'This Mewtwo GX is from the popular 2016 Pokémon Base Set. Professionally graded by PSA, the card received an impressive PSA 9 MINT grade.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€79'
  },
  {
    id: 6,
    title: 'Eevee Promo',
    subtitle: 'Base Set - 10/102',
    description:
      'This Eevee Promo is from the popular 2016 Pokémon Base Set. Professionally graded by PSA, the card received an impressive PSA 9 MINT grade.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png']
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
