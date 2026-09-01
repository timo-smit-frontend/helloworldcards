import { SITE_IMAGE } from '../seo/site'
import type { CmsMediaCopy } from '../cms/types'

export const SITE_IMAGE_TITLE = 'Pokémon tournament with a giant Pikachu balloon'
export const SITE_IMAGE_ALT =
  'A packed Pokémon card tournament in a convention hall, with a giant yellow Pikachu balloon hanging from the ceiling.'

type ImageCopy = CmsMediaCopy

const IMAGE_COPY: Record<string, ImageCopy> = {
  [SITE_IMAGE]: {
    title: SITE_IMAGE_TITLE,
    alt: SITE_IMAGE_ALT
  },
  '/media/wooper.png': {
    title: 'Wooper',
    alt: 'Wooper, a smiling blue Pokémon with branching pink gills.'
  },
  '/media/BannerFigcaption.jpg': {
    title: 'Banner with image and caption',
    alt: 'Preview of the banner with image and caption component.'
  },
  '/media/ContentText.png': {
    title: 'Text with image',
    alt: 'Preview of the text with image component.'
  },
  '/media/ContentCta.jpg': {
    title: 'Call to action with image',
    alt: 'Preview of the call to action with image component.'
  },
  '/media/ContentProducts.jpg': {
    title: 'Product listing',
    alt: 'Preview of the product listing component.'
  },
  '/media/ContentAgenda.png': {
    title: 'Event agenda',
    alt: 'Preview of the event agenda component.'
  },
  '/media/ContentFaq.png': {
    title: 'Frequently asked questions',
    alt: 'Preview of the frequently asked questions component.'
  },
  '/media/ContentAbout.png': {
    title: 'About with people',
    alt: 'Preview of the about with people component.'
  },
  '/media/FormContact.png': {
    title: 'Contact form',
    alt: 'Preview of the contact form component.'
  },
  '/media/Product.png': {
    title: 'Product',
    alt: 'Preview of a product page.'
  },
  '/media/148651617_front.jpg': {
    title: 'Mewtwo, front',
    alt: 'PSA 9 XY Evolutions Mewtwo reverse holo, 51/108, in a grading slab.'
  },
  '/media/148651617_back.jpg': {
    title: 'Mewtwo, back',
    alt: 'The back of a graded Pokémon card in a PSA slab, showing the Poké Ball design.'
  },
  '/media/76719295_front.jpg': {
    title: 'Lugia V, front',
    alt: 'PSA 9 Silver Tempest Lugia V full art, 185/195, in a grading slab.'
  },
  '/media/76719295_back.jpg': {
    title: 'Lugia V, back',
    alt: 'The back of a graded Pokémon card in a PSA slab, showing the Poké Ball design.'
  },
  '/media/61958598_front.jpg': {
    title: 'Charizard, front',
    alt: 'PSA 9 XY Generations Radiant Collection Charizard holo, RC5/RC32, in a grading slab.'
  },
  '/media/61958598_back.jpg': {
    title: 'Charizard, back',
    alt: 'The back of a graded Pokémon card in a PSA slab, showing the Poké Ball design.'
  },
  '/media/76645522_front.jpg': {
    title: 'Ekans, front',
    alt: 'PSA 9 1st Edition Team Rocket Ekans, 56/82, in a grading slab.'
  },
  '/media/76645522_back.jpg': {
    title: 'Ekans, back',
    alt: 'The back of a graded Pokémon card in a PSA slab, showing the Poké Ball design.'
  },
  '/media/18501427_front.jpg': {
    title: 'Zorua AR, front',
    alt: 'BGS 9.5 White Flare Japanese Zorua Art Rare, 140/086, in a Beckett grading slab.'
  },
  '/media/18501427_back.jpg': {
    title: 'Zorua AR, back',
    alt: 'The back of a graded Japanese Pokémon card in a Beckett slab, showing the Poké Ball design.'
  },
  '/media/80573086_front.jpg': {
    title: 'Poke Kid, front',
    alt: 'PSA 10 Shiny Star V Japanese Poke Kid full art, 197/190, in a grading slab.'
  },
  '/media/80573086_back.jpg': {
    title: 'Poke Kid, back',
    alt: 'The back of a graded Japanese Pokémon card in a PSA slab, showing the Poké Ball design.'
  }
}

let cmsMediaCopy: Record<string, ImageCopy> = {}

export function setCmsMediaCopy(copy: Record<string, ImageCopy> | undefined) {
  cmsMediaCopy = copy ?? {}
}

export function toMediaSrc(src: string): string {
  const path = src.startsWith('/public/') ? src.slice('/public'.length) : src
  return path.replace(/^\/images\//, '/media/')
}

export function imageCopyFor(src: string): ImageCopy | undefined {
  const key = toMediaSrc(src)
  const fromCms = cmsMediaCopy[key]
  if (fromCms?.title || fromCms?.alt) {
    return fromCms
  }
  return IMAGE_COPY[key]
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
