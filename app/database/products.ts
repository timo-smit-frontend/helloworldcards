export type Product = {
  id: number
  slug: string
  title: string
  description: string
  image: string
  imageHover: string
  price?: string | number
  category?: string
}

const products: Product[] = [
  {
    id: 1,
    slug: 'charizard-holo',
    title: 'Charizard Holo',
    description: 'A classic holographic Charizard card from the Base Set era.',
    image: 'https://picsum.photos/seed/charizard/600/800',
    imageHover: 'https://picsum.photos/seed/charizard-hover/600/800',
    price: '€249',
    category: 'Pokemon'
  },
  {
    id: 2,
    slug: 'blastoise-holo',
    title: 'Blastoise Holo',
    description: 'Powerful Water-type evolution with a deep blue holographic finish.',
    image: 'https://picsum.photos/seed/blastoise/600/800',
    imageHover: 'https://picsum.photos/seed/blastoise-hover/600/800',
    price: '€189',
    category: 'Pokemon'
  },
  {
    id: 3,
    slug: 'venusaur-holo',
    title: 'Venusaur Holo',
    description: 'Grass-type powerhouse with a rich green holographic pattern.',
    image: 'https://picsum.photos/seed/venusaur/600/800',
    imageHover: 'https://picsum.photos/seed/venusaur-hover/600/800',
    price: '€159',
    category: 'Pokemon'
  },
  {
    id: 4,
    slug: 'pikachu-illustrator',
    title: 'Pikachu Illustrator',
    description: 'An ultra-rare promotional Pikachu card for serious collectors.',
    image: 'https://picsum.photos/seed/pikachu/600/800',
    imageHover: 'https://picsum.photos/seed/pikachu-hover/600/800',
    price: '€1.200',
    category: 'Pokemon'
  },
  {
    id: 5,
    slug: 'mewtwo-gx',
    title: 'Mewtwo GX',
    description: 'Psychic-type GX card with striking artwork and playability.',
    image: 'https://picsum.photos/seed/mewtwo/600/800',
    imageHover: 'https://picsum.photos/seed/mewtwo-hover/600/800',
    price: '€79',
    category: 'Pokemon'
  },
  {
    id: 6,
    slug: 'eevee-promo',
    title: 'Eevee Promo',
    description: 'Cute promo Eevee — a friendly starter for any collection.',
    image: 'https://picsum.photos/seed/eevee/600/800',
    imageHover: 'https://picsum.photos/seed/eevee-hover/600/800',
    category: 'Pokemon'
  }
]

export function getAllProducts(): Product[] {
  return [...products]
}

export function getProductsByIds(ids: Array<string | number>): Product[] {
  const byId = new Map(products.map((product) => [String(product.id), product]))

  return ids.map((id) => byId.get(String(id))).filter((product): product is Product => product != null)
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug)
}
