import { BUILD_WIDTHS, type ImageFormat } from '~/services/responsiveImage'

// Uploads used to land in R2 as a single full-size original, so every thumbnail in the
// media library pulled the whole file down. The browser re-encodes the picture into the
// same widths the site build produces, and those go up with the original. Canvas cannot
// encode AVIF, so WebP is the only format made here; the worker serves it to AVIF
// requests as well.
const VARIANT_FORMAT: ImageFormat = 'webp'
const VARIANT_TYPE = 'image/webp'
const VARIANT_QUALITY = 0.82
const RESIZABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function variantUploadName(width: number, format: ImageFormat = VARIANT_FORMAT): string {
  return `w${width}.${format}`
}

async function encodeWidth(bitmap: ImageBitmap, width: number): Promise<File | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width))
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, VARIANT_TYPE, VARIANT_QUALITY))
  // A browser without a WebP encoder hands back a PNG, which would be larger than the
  // original and wrong for the key it is stored under.
  if (!blob || blob.type !== VARIANT_TYPE) {
    return null
  }
  return new File([blob], variantUploadName(width), { type: VARIANT_TYPE })
}

export async function buildUploadVariants(file: File): Promise<File[]> {
  if (!RESIZABLE_TYPES.has(file.type) || typeof createImageBitmap !== 'function') {
    return []
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return []
  }
  const variants: File[] = []
  try {
    for (const width of BUILD_WIDTHS) {
      if (width > bitmap.width) {
        break
      }
      const variant = await encodeWidth(bitmap, width)
      if (!variant) {
        return []
      }
      variants.push(variant)
    }
  } finally {
    bitmap.close()
  }
  return variants
}

export async function appendUploadVariants(body: FormData, file: File): Promise<void> {
  for (const variant of await buildUploadVariants(file)) {
    body.append('variant', variant)
  }
}
