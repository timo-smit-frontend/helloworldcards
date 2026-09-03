import type { CardGrader, CardLanguage } from '../database/products'

export const CMS_BLOCK_TYPES = [
  'banner_figcaption',
  'content_text',
  'content_cta',
  'content_products',
  'content_agenda',
  'content_faq',
  'content_about',
  'form_contact'
] as const

export type CmsBlockType = (typeof CMS_BLOCK_TYPES)[number]

export const FEATURED_PRODUCT_COUNT = 4

export const CMS_BLOCK_LABELS: Record<CmsBlockType, string> = {
  banner_figcaption: 'Banner with image and caption',
  content_text: 'Text with image',
  content_cta: 'Call to action with image',
  content_products: 'Product listing',
  content_agenda: 'Event agenda',
  content_faq: 'Frequently asked questions',
  content_about: 'About with people',
  form_contact: 'Contact form'
}

export type CmsLink = {
  url?: string
  title?: string
  target?: string
}

export type CmsTextSection = {
  title: string
  body: string
}

export type CmsPerson = {
  name: string
  description: string
  pokemonIds?: number[]
}

export type CmsBlock =
  | {
      id: string
      type: 'banner_figcaption'
      title?: string
      srTitle?: string
      description?: string
      image?: string
      alt?: string
      figcaption?: string
      link?: CmsLink
    }
  | {
      id: string
      type: 'content_text'
      title?: string
      srTitle?: string
      description?: string
      image?: string
      alt?: string
      heading?: 'h1' | 'h2'
      link?: CmsLink
      sections?: CmsTextSection[]
      updated?: string
    }
  | {
      id: string
      type: 'content_cta'
      title?: string
      description?: string
      image?: string
      alt?: string
      link?: CmsLink
    }
  | {
      id: string
      type: 'content_products'
      title?: string
      description?: string
      random?: boolean
    }
  | {
      id: string
      type: 'content_agenda'
      title?: string
      description?: string
      eventIds?: number[]
    }
  | {
      id: string
      type: 'content_faq'
      title?: string
      faqIds?: number[]
    }
  | {
      id: string
      type: 'content_about'
      title: string
      description: string
      people: CmsPerson[]
      peopleCaption: string
    }
  | {
      id: string
      type: 'form_contact'
      title?: string
      description?: string
    }

export type CmsPageStatus = 'draft' | 'published'

export type CmsPage = {
  id: number
  path: string
  status: CmsPageStatus
  title: string
  seoTitle: string
  seoDescription: string
  seoImage: string | null
  blocks: CmsBlock[]
}

export type CmsNavItem = {
  id: number
  location: 'header' | 'footer'
  label: string
  href: string
  sort: number
}

export type CmsSettings = {
  siteDescription: string
  siteImage: string
  siteImageAlt: string
  contactEmail: string
  instagramUrl: string
  marktplaatsUrl: string
  notFoundTitle: string
  notFoundDescription: string
  notFoundCta: string
  cmsSeedVersion?: number
}

export type CmsEvent = {
  id: number
  title: string
  date: string
  location: string
}

export type CmsFaq = {
  id: number
  question: string
  answer: string
}

export type CmsMedia = {
  id: number
  key: string
  filename: string
  contentType: string
  width: number | null
  height: number | null
  bytes: number
  title: string
  alt: string
  url: string
  createdAt: string
}

export type CmsMediaCopy = {
  title: string
  alt: string
}

export type R2UsageMetric = 'storage' | 'classA' | 'classB'

export type R2UsageSnapshot = {
  month: string
  storageBytes: number
  classA: number
  classB: number
  limits: {
    storageBytes: number
    classA: number
    classB: number
  }
  warnings: Array<{
    metric: R2UsageMetric
    level: 'warn' | 'alert'
    used: number
    limit: number
  }>
}

export type CmsProductRecord = {
  id: number
  title: string
  subtitle: string
  description: string
  images: string[]
  pokemonId?: number
  price?: string
  language?: CardLanguage
  grader?: CardGrader
  year?: number
  marktplaatsUrl?: string
  vintedUrl?: string
  slug: string
  cost?: number
  sold: boolean
  concept: boolean
  soldAt?: string
  acquiredAt?: string
  grade?: number
  cardmarketUrl?: string
  reverseHolo: boolean
  firstEdition: boolean
}

export type PublicProduct = {
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
  slug: string
}

export type PublicCmsPayload = {
  settings: CmsSettings
  nav: {
    header: CmsNavItem[]
    footer: CmsNavItem[]
  }
  page: CmsPage | null
  product: PublicProduct | null
  similarProductIds: number[]
  products: PublicProduct[]
  events: CmsEvent[]
  faqs: CmsFaq[]
  mediaCopy: Record<string, CmsMediaCopy>
  notFound: boolean
}
