export const VINTED_ORIGIN = 'https://www.vinted.nl'

export type VintedOverviewListing = {
  title: string
  ask: number
  vintedUrl: string
  imageUrl: string | null
  itemId: string
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of tag.matchAll(/([a-zA-Z:-]+)="((?:\\.|[^"\\])*)"/g)) {
    attrs[match[1]] = decodeHtml(match[2])
  }
  return attrs
}

/** Turn `/items/123-slug` into a readable fallback title. */
export function titleFromVintedSlug(slug: string): string {
  const withoutId = slug.replace(/^\d+-/, '')
  return withoutId.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Parse the hover title on catalog cards: description, Merk, Staat, ask, total. */
export function parseVintedHoverTitle(raw: string): { title: string; ask: number } | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  const priceMatch = trimmed.match(/,\s*([\d.,]+)\s*€,\s*[\d.,]+\s*€\s*$/)
  if (!priceMatch) {
    return null
  }

  const ask = Number(priceMatch[1].replace(',', '.'))
  if (!Number.isFinite(ask) || ask <= 0) {
    return null
  }

  const title = trimmed.replace(/,\s*Merk:.*$/i, '').trim()
  if (!title) {
    return null
  }

  return { title, ask }
}

function absoluteVintedUrl(path: string): string {
  if (path.startsWith('http')) {
    return path.split('?')[0] ?? path
  }
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${VINTED_ORIGIN}${normalized.split('?')[0] ?? normalized}`
}

export function parseVintedOverview(html: string): VintedOverviewListing[] {
  const listings: VintedOverviewListing[] = []
  const seen = new Set<string>()

  for (const match of html.matchAll(/data-testid="product-item-id-(\d+)--overlay-link"/g)) {
    const itemId = match[1]
    if (seen.has(itemId)) {
      continue
    }
    seen.add(itemId)

    const overlayTag = html.match(
      new RegExp(`<a[^>]*data-testid="product-item-id-${itemId}--overlay-link"[^>]*>`, 'i')
    )?.[0]
    const imgTag = html.match(
      new RegExp(`<img[^>]*data-testid="product-item-id-${itemId}--image--img"[^>]*>`, 'i')
    )?.[0]

    const overlay = overlayTag ? parseTagAttributes(overlayTag) : {}
    const img = imgTag ? parseTagAttributes(imgTag) : {}

    const href = overlay.href ?? ''
    const slug = href.match(/\/items\/(\d+-[^?]+)/)?.[1] ?? `${itemId}`
    const hoverRaw = overlay.title ?? img.alt ?? ''
    const parsedHover = parseVintedHoverTitle(hoverRaw)
    const title = parsedHover?.title ?? titleFromVintedSlug(slug.replace(/^\d+-/, ''))
    const ask = parsedHover?.ask

    if (ask == null) {
      continue
    }

    listings.push({
      itemId,
      title,
      ask,
      vintedUrl: absoluteVintedUrl(href || `/items/${slug}`),
      imageUrl: img.src ?? null
    })
  }

  return listings
}

export const VINTED_CHALLENGE =
  /just a moment|attention required|cf-browser-verification|cf-error-details|checking your browser|enable javascript/i

export function isVintedChallenge(html: string): boolean {
  return VINTED_CHALLENGE.test(html) && !html.includes('product-item-id-')
}
