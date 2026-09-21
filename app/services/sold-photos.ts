import type { ProductRecord } from '../database/products'
import { BUILD_WIDTHS } from './responsiveImage'

/**
 * A sold card is off the shop and its ads are gone, so nothing shows its photos any
 * more except the dashboard's sold list, which only ever asks for the smallest build
 * width. One photo of that width is all the card keeps: the front, as a WebP, under a
 * key that says so. The back and both full-size originals go, and with them a dozen
 * resizes apiece.
 */
export const SOLD_PHOTO_WIDTH: number = BUILD_WIDTHS[0]

/** The media folder a sold card's one remaining photo is filed in, next to `Slabs`. */
export const SOLD_MEDIA_FOLDER = 'Sold'

const SOLD_PHOTO_SUFFIX = '-sold.webp'
const MEDIA_PREFIX = '/media/'

/** The bucket key behind a `/media/…` URL, or null for anything else. */
export function mediaKeyOf(url: string): string | null {
  return url.startsWith(MEDIA_PREFIX) ? url.slice(MEDIA_PREFIX.length) : null
}

export function mediaUrlOf(key: string): string {
  return `${MEDIA_PREFIX}${key}`
}

/** Whether a key or URL is the small photo a sold card keeps. */
export function isSoldPhoto(keyOrUrl: string): boolean {
  return keyOrUrl.endsWith(SOLD_PHOTO_SUFFIX)
}

/** The name the small photo takes — key or filename: the original's stem, marked as the sold copy. */
export function soldPhotoName(original: string): string {
  return `${original.replace(/\.[a-z0-9]+$/i, '')}${SOLD_PHOTO_SUFFIX}`
}

export type SoldPhotoPlan = {
  /** The front photo to shrink into the one the card keeps, or null when it already is one. */
  shrink: string | null
  /** Every other photo the card still carries; gone for good. */
  drop: string[]
}

/**
 * What a sold card's photos still need done, or null when nothing: the card is not sold,
 * has no photos, or already keeps just the one small photo.
 */
export function soldPhotoPlan(product: Pick<ProductRecord, 'sold' | 'images'>): SoldPhotoPlan | null {
  if (!product.sold) {
    return null
  }
  const images = (product.images ?? []).map(mediaKeyOf).filter((key): key is string => key != null)
  if (images.length === 0) {
    return null
  }
  const [front, ...rest] = images
  const shrink = isSoldPhoto(front) ? null : front
  if (shrink === null && rest.length === 0) {
    return null
  }
  return { shrink, drop: rest }
}

/**
 * The cert number in a slab photo's key — `mu00djsz-122301454-front.jpg`,
 * `148651617_front.jpg`, or the sold copy of either — which is also the name of the
 * branded ad photo under `public/ads`.
 */
export function certOfSlabPhotoKey(key: string): string | null {
  return key.match(/(\d{6,})[-_]front(?:-sold)?\.(?:jpe?g|webp)$/i)?.[1] ?? null
}
