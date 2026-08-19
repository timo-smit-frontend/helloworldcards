import { SITE_IMAGE } from '../seo/site'

export const SITE_IMAGE_TITLE = 'Pokémon tournament with a giant Pikachu balloon'
export const SITE_IMAGE_ALT =
  'A packed Pokémon card tournament in a convention hall, with a giant yellow Pikachu balloon hanging from the ceiling.'

type ImageCopy = {
  title: string
  alt: string
}

const IMAGE_COPY: Record<string, ImageCopy> = {
  [SITE_IMAGE]: {
    title: SITE_IMAGE_TITLE,
    alt: SITE_IMAGE_ALT
  },
  '/images/wooper.png': {
    title: 'Wooper',
    alt: 'Wooper, a smiling blue Pokémon with branching pink gills.'
  },
  '/images/148651617_front.jpg': {
    title: 'Mewtwo Reverse Holo, front',
    alt: 'PSA 9 XY Evolutions Mewtwo reverse holo, 51/108, in a grading slab.'
  },
  '/images/148651617_back.jpg': {
    title: 'Mewtwo Reverse Holo, back',
    alt: 'The back of a graded Pokémon card in a PSA slab, showing the Poké Ball design.'
  }
}

function normalizeSrc(src: string) {
  return src.startsWith('/public/') ? src.slice('/public'.length) : src
}

export function imageCopyFor(src: string): ImageCopy | undefined {
  return IMAGE_COPY[normalizeSrc(src)]
}

export function imageTitleFor(src: string): string | undefined {
  return imageCopyFor(src)?.title
}

export function imageAltFor(src: string): string | undefined {
  return imageCopyFor(src)?.alt
}

export function resolveImageAlt(src: string, alt?: string) {
  if (alt != null) return alt
  return imageAltFor(src) ?? ''
}

export function resolveImageTitle(src: string, title?: string, alt?: string) {
  if (title != null) return title || undefined
  return imageTitleFor(src) ?? (alt || undefined)
}
