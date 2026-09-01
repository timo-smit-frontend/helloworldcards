import type { CmsBlockType } from './types'

export const CMS_COMPONENT_PREVIEW_KEYS = [
  'BannerFigcaption.jpg',
  'ContentText.png',
  'ContentCta.jpg',
  'ContentProducts.jpg',
  'ContentAgenda.png',
  'ContentFaq.png',
  'ContentAbout.png',
  'FormContact.png',
  'Product.png'
] as const

export const CMS_BLOCK_PREVIEWS: Partial<Record<CmsBlockType, string>> = {
  banner_figcaption: '/media/BannerFigcaption.jpg',
  content_text: '/media/ContentText.png',
  content_cta: '/media/ContentCta.jpg',
  content_products: '/media/ContentProducts.jpg',
  content_agenda: '/media/ContentAgenda.png',
  content_faq: '/media/ContentFaq.png',
  content_about: '/media/ContentAbout.png',
  form_contact: '/media/FormContact.png'
}

export function sortMediaLibrary<T extends { id: number; key: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aIndex = previewIndex(a.key)
    const bIndex = previewIndex(b.key)
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
    if (aIndex >= 0) return 1
    if (bIndex >= 0) return -1
    return b.id - a.id
  })
}

function previewIndex(key: string) {
  return (CMS_COMPONENT_PREVIEW_KEYS as readonly string[]).indexOf(key)
}
