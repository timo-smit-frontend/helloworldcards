import type { InventoryProduct } from '../database/products'

/**
 * Relisting on Vinted.
 *
 * Vinted has no "bump for free" — a listing only climbs back to the top of the
 * catalogue as a new listing. So a relist is a delete followed by an upload of
 * exactly the same thing. Everything here is the pure part of that: reading what a
 * listing is made of off Vinted's pages, working out how old each one is, and joining
 * the seller's wardrobe to the shop's products. Driving the browser lives in
 * `vite/vinted-relist.ts`.
 */

export const VINTED_ITEMS_ORIGIN = 'https://www.vinted.nl'

/** `https://www.vinted.nl/items/9878696344-mewtwo-...` → `9878696344`. */
export function vintedItemId(url: string): string | null {
  return url.match(/vinted\.[a-z.]+\/items\/(\d+)/i)?.[1] ?? url.match(/^(\d{6,})$/)?.[1] ?? null
}

export function vintedItemUrl(itemId: string): string {
  return `${VINTED_ITEMS_ORIGIN}/items/${itemId}`
}

/**
 * Everything the upload form asks for, as the edit page of a listing hands it back.
 *
 * The ids are the ones the form's own pickers are keyed on (`catalog-4875`,
 * `brand-191646`, `condition-1`, `package_type_selector_1`), so a snapshot can be
 * played straight back into a new listing without looking anything up by name.
 */
export type VintedSnapshot = {
  itemId: string
  title: string
  description: string
  catalogId: number
  brandId: number | null
  brandTitle: string | null
  conditionId: number | null
  packageSizeId: number | null
  /** Euros as Vinted stores them, e.g. `89.99`. */
  price: number
  isUnisex: boolean
  colorIds: number[]
  /** In upload order; the first one is the main photo. */
  photos: Array<{ id: number; url: string }>
}

type EditModel = {
  id?: number
  title?: string
  description?: string
  catalogId?: number
  brandId?: number | null
  brand?: { id?: number; title?: string } | null
  packageSizeId?: number | null
  price?: number | string
  isUnisex?: boolean
  colorIds?: number[]
  itemAttributes?: Array<{ code?: string; ids?: number[] }>
}

type EditPhoto = { id?: number; url?: string }

/**
 * Vinted's pages are Next.js RSC payloads: each `<script>` pushes a JS string literal
 * of flight data, and the interesting JSON is inside that string, escaped once more.
 * Decoding every chunk and joining them puts the JSON back in plain form.
 */
export function vintedFlightData(html: string): string {
  const chunks: string[] = []
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      chunks.push(JSON.parse(match[1]) as string)
    } catch {
      // A chunk that is not a clean string literal is one we cannot read.
    }
  }
  return chunks.join('')
}

/** The JSON object that starts at `start` (which must point at its `{` or `[`). */
function balancedJson(text: string, start: number): string | null {
  const open = text[start]
  const close = open === '{' ? '}' : open === '[' ? ']' : null
  if (!close) {
    return null
  }
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (char === '\\') {
        i += 1
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }
  return null
}

function jsonAfterKey<T>(text: string, key: string): T | null {
  const marker = `"${key}":`
  const at = text.indexOf(marker)
  if (at === -1) {
    return null
  }
  const raw = balancedJson(text, at + marker.length)
  if (!raw) {
    return null
  }
  try {
    // RSC writes `"$undefined"` where a value is missing; JSON has null for that.
    return JSON.parse(raw.replace(/"\$undefined"/g, 'null')) as T
  } catch {
    return null
  }
}

/** The signed photo URL, with the `&` the flight data spells as a `u0026` escape restored. */
function photoUrl(url: string): string {
  return url.replace(/\\u0026/g, '&')
}

/** Read a listing's `itemEditModel` (and its photos) off `/items/{id}/edit`. */
export function parseVintedSnapshot(html: string): VintedSnapshot | null {
  const flight = vintedFlightData(html)
  const model = jsonAfterKey<EditModel>(flight, 'itemEditModel')
  if (!model || model.id == null || !model.title || model.catalogId == null) {
    return null
  }

  // The photos sit next to the model rather than in it, right after it closes.
  const modelStart = flight.indexOf('"itemEditModel":')
  const modelRaw = balancedJson(flight, modelStart + '"itemEditModel":'.length) ?? ''
  const photoText = flight.slice(modelStart + modelRaw.length)
  const photos = (jsonAfterKey<EditPhoto[]>(photoText, 'photos') ?? [])
    .filter((photo): photo is { id: number; url: string } => typeof photo.id === 'number' && typeof photo.url === 'string')
    .map((photo) => ({ id: photo.id, url: photoUrl(photo.url) }))

  const price = typeof model.price === 'string' ? Number(model.price) : (model.price ?? NaN)
  if (!Number.isFinite(price)) {
    return null
  }

  const condition = model.itemAttributes?.find((attribute) => attribute.code === 'condition')?.ids?.[0] ?? null

  return {
    itemId: String(model.id),
    title: model.title,
    description: model.description ?? '',
    catalogId: model.catalogId,
    brandId: model.brandId ?? model.brand?.id ?? null,
    brandTitle: model.brand?.title ?? null,
    conditionId: condition,
    packageSizeId: model.packageSizeId ?? null,
    price,
    isUnisex: Boolean(model.isUnisex),
    colorIds: model.colorIds ?? [],
    photos
  }
}

/**
 * The listing page only says how long ago it went up, in words: the `upload_date`
 * detail reads `een week geleden`, `3 dagen geleden`, and so on.
 */
export function parseVintedUploadedText(html: string): string | null {
  const flight = html.includes('__next_f') ? vintedFlightData(html) : html
  const match = flight.match(/"code":"upload_date","data":\{"title":"[^"]*","value":"([^"]*)"/)
  return match ? match[1] : null
}

const DUTCH_COUNT: Record<string, number> = {
  een: 1,
  één: 1,
  twee: 2,
  drie: 3,
  vier: 4,
  vijf: 5,
  zes: 6,
  zeven: 7,
  acht: 8,
  negen: 9,
  tien: 10
}

/**
 * `3 dagen geleden` → 3, `een week geleden` → 7, `2 maanden geleden` → 60.
 *
 * Anything under a day counts as today. Unknown wording is left as null rather than
 * guessed, so the screen can show the words instead of a wrong number.
 */
export function dutchRelativeDays(text: string | null): number | null {
  if (!text) {
    return null
  }
  const normalized = text.trim().toLowerCase()
  if (/^(zojuist|net|nu)$/.test(normalized) || /\b(seconde|minuut|minuten|uur|uren)\b/.test(normalized)) {
    return 0
  }
  if (/^gisteren$/.test(normalized)) {
    return 1
  }
  const match = normalized.match(
    /^(\d+|een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)\s+(dag|dagen|week|weken|maand|maanden|jaar|jaren)\s+geleden$/
  )
  if (!match) {
    return null
  }
  const count = /^\d+$/.test(match[1]) ? Number(match[1]) : DUTCH_COUNT[match[1]]
  const unit = match[2]
  if (unit.startsWith('dag')) return count
  if (unit.startsWith('we')) return count * 7
  if (unit.startsWith('maand')) return count * 30
  return count * 365
}

/** One item as `/api/v2/wardrobe/{userId}/items` lists it. */
export type VintedWardrobeItem = {
  id: number
  title: string
  path?: string
  url?: string
  price?: { amount?: string } | string
  is_draft?: boolean
  is_closed?: boolean
  is_reserved?: boolean
  is_hidden?: boolean
  favourite_count?: number
  view_count?: number
  photos?: Array<{
    url?: string
    thumbnails?: Array<{ type?: string; url?: string }>
    /** Vinted stamps each photo with its upload time, in Unix seconds. */
    high_resolution?: { timestamp?: number } | null
  }>
}

export function parseWardrobeItems(body: unknown): VintedWardrobeItem[] {
  const items = (body as { items?: unknown })?.items
  if (!Array.isArray(items)) {
    return []
  }
  return items.filter((item): item is VintedWardrobeItem => typeof item?.id === 'number' && typeof item?.title === 'string')
}

/** When we last relisted a listing, keyed on the id it has now. */
export type VintedRelistRecord = {
  itemId: string
  previousItemId: string
  productId: number | null
  /** ISO timestamp of the upload. */
  listedAt: string
}

/**
 * A relist that got as far as deleting the old listing and no further.
 *
 * The snapshot is saved before the delete, so the listing is never lost: the
 * upload can be retried from here without the original.
 */
export type VintedPendingRelist = {
  snapshot: VintedSnapshot
  productId: number | null
  /** Photos already downloaded, as paths the upload can hand straight to the form. */
  photoFiles: string[]
  deletedAt: string
  error: string
}

/**
 * Vinted's `Geüpload` wording for a listing, and when it was read.
 *
 * The wording is relative — `een week geleden` — so it is only right on the day it
 * was read; the days since then are added to it. Keeping the note means the
 * listing page is read once per listing, not once per look at the screen.
 */
export type VintedAgeNote = {
  text: string | null
  /** ISO timestamp of the read. */
  readAt: string
}

export type VintedRelistState = {
  records: Record<string, VintedRelistRecord>
  pending: Record<string, VintedPendingRelist>
  /** Ages read off listing pages, keyed on item id; pruned to the wardrobe. */
  ages: Record<string, VintedAgeNote>
  /** ISO timestamp until which Vinted is left alone after it rate-limited this computer. */
  cooldownUntil: string | null
}

export function emptyRelistState(): VintedRelistState {
  return { records: {}, pending: {}, ages: {}, cooldownUntil: null }
}

/** Fill in whatever an older state file did not have yet. */
export function normalizeRelistState(parsed: Partial<VintedRelistState> | null | undefined): VintedRelistState {
  return {
    records: parsed?.records ?? {},
    pending: parsed?.pending ?? {},
    ages: parsed?.ages ?? {},
    cooldownUntil: parsed?.cooldownUntil ?? null
  }
}

/** How much longer Vinted is to be left alone, in ms; 0 when it is fine to go. */
export function cooldownRemainingMs(state: Pick<VintedRelistState, 'cooldownUntil'>, now = new Date()): number {
  const until = state.cooldownUntil ? Date.parse(state.cooldownUntil) : NaN
  return Number.isFinite(until) ? Math.max(0, until - now.getTime()) : 0
}

/**
 * Vinted's "You are rate limited" page, which it serves instead of anything else
 * once a computer has asked for too much too quickly. It is not a bot check — there
 * is nothing to click — it lifts by itself after a while of being left alone.
 */
export function pageLooksRateLimited(title: string, text: string): boolean {
  return /rate limited|too many requests|te veel verzoeken/i.test(`${title}\n${text}`)
}

export type VintedListingStatus = 'live' | 'reserved' | 'hidden' | 'draft' | 'closed'

/** One row of the relist screen. */
export type VintedRelistRow = {
  itemId: string
  url: string
  title: string
  /** Euros, as Vinted lists it. */
  price: number | null
  imageUrl: string | null
  status: VintedListingStatus
  views: number | null
  favourites: number | null
  /** Days since the listing went up — exact after a relist or from its photo stamp, Vinted's own words otherwise. */
  ageDays: number | null
  /** How Vinted phrases the age, when we have nothing better. */
  ageText: string | null
  /** When it went up, when known to the minute. */
  listedAt: string | null
  product: { id: number; title: string; slug: string } | null
}

export type VintedRelistReport = {
  /** The seller's live wardrobe, newest upload first. */
  rows: VintedRelistRow[]
  /** Deleted-but-not-yet-reuploaded listings waiting for a retry. */
  pending: Array<{ itemId: string; title: string; deletedAt: string; error: string; product: VintedRelistRow['product'] }>
  /** Products the shop says are on Vinted but the wardrobe does not have. */
  missing: Array<{ product: NonNullable<VintedRelistRow['product']>; url: string }>
  /** Which Vinted account the wardrobe belongs to. */
  login: string | null
  fetchedAt: string
}

function wardrobeStatus(item: VintedWardrobeItem): VintedListingStatus {
  if (item.is_closed) return 'closed'
  if (item.is_draft) return 'draft'
  if (item.is_hidden) return 'hidden'
  if (item.is_reserved) return 'reserved'
  return 'live'
}

function wardrobePrice(item: VintedWardrobeItem): number | null {
  const raw = typeof item.price === 'string' ? item.price : item.price?.amount
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

function wardrobeThumbnail(item: VintedWardrobeItem): string | null {
  const photo = item.photos?.[0]
  if (!photo) {
    return null
  }
  const thumb = photo.thumbnails?.find((candidate) => candidate.type === 'thumb310x430') ?? photo.thumbnails?.[0]
  return thumb?.url ?? photo.url ?? null
}

export function wholeDaysSince(iso: string, now: Date): number {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) {
    return 0
  }
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000))
}

/** The oldest a photo timestamp can be and still be believed: Vinted's first year. */
const EARLIEST_PHOTO_TS = Date.UTC(2008, 0, 1) / 1000

/**
 * When the listing's main photo was uploaded, which is when the listing went up — a
 * listing is made by uploading its photos and publishing minutes later. Read from
 * the wardrobe when Vinted includes the stamp, so nothing else has to be asked.
 */
export function wardrobeUploadedAt(item: VintedWardrobeItem, now: Date): number | null {
  const stamp = item.photos?.[0]?.high_resolution?.timestamp
  if (typeof stamp !== 'number' || !Number.isFinite(stamp) || stamp < EARLIEST_PHOTO_TS) {
    return null
  }
  const ms = stamp * 1000
  return ms <= now.getTime() + 86_400_000 ? ms : null
}

/**
 * Listings whose age nothing on hand can tell: no relist record of ours, no upload
 * stamp in the wardrobe, no note from an earlier read. Only these need their page read.
 */
export function listingsWithoutAge(wardrobe: VintedWardrobeItem[], state: VintedRelistState, now = new Date()): string[] {
  return wardrobe
    .filter((item) => {
      const itemId = String(item.id)
      return !state.records[itemId] && wardrobeUploadedAt(item, now) == null && !state.ages[itemId]
    })
    .map((item) => String(item.id))
}

/** Age in days from a note: the words as read, plus the days gone by since. */
function daysFromNote(note: VintedAgeNote | undefined, now: Date): number | null {
  const read = note ? dutchRelativeDays(note.text) : null
  return read == null || !note ? null : read + wholeDaysSince(note.readAt, now)
}

/**
 * Join the wardrobe to the shop.
 *
 * The wardrobe is the truth about what is on Vinted; the shop tells us which card each
 * listing is. A listing we relisted ourselves has an exact age from our own record;
 * the rest go by the wardrobe's photo stamp, or by whatever Vinted said on the
 * listing page the one time it was read.
 */
export function buildRelistReport(input: {
  wardrobe: VintedWardrobeItem[]
  products: InventoryProduct[]
  state: VintedRelistState
  login: string | null
  now?: Date
}): VintedRelistReport {
  const now = input.now ?? new Date()
  const byItemId = new Map<string, InventoryProduct>()
  for (const product of input.products) {
    const id = product.vintedUrl ? vintedItemId(product.vintedUrl) : null
    if (id) {
      byItemId.set(id, product)
    }
  }

  const productRef = (product: InventoryProduct | undefined) =>
    product ? { id: product.id, title: product.title, slug: product.slug } : null

  const rows: VintedRelistRow[] = input.wardrobe.map((item) => {
    const itemId = String(item.id)
    const product = byItemId.get(itemId)
    const record = input.state.records[itemId]
    const uploadedAt = wardrobeUploadedAt(item, now)
    const note = input.state.ages[itemId]
    return {
      itemId,
      url: item.url ?? (item.path ? `${VINTED_ITEMS_ORIGIN}${item.path}` : vintedItemUrl(itemId)),
      title: item.title,
      price: wardrobePrice(item),
      imageUrl: wardrobeThumbnail(item),
      status: wardrobeStatus(item),
      views: item.view_count ?? null,
      favourites: item.favourite_count ?? null,
      ageDays: record
        ? wholeDaysSince(record.listedAt, now)
        : uploadedAt != null
          ? wholeDaysSince(new Date(uploadedAt).toISOString(), now)
          : daysFromNote(note, now),
      ageText: note?.text ?? null,
      listedAt: record?.listedAt ?? (uploadedAt != null ? new Date(uploadedAt).toISOString() : null),
      product: productRef(product)
    }
  })

  // Oldest first: the ones most in need of a relist sit at the top.
  rows.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1) || a.title.localeCompare(b.title))

  const seen = new Set(rows.map((row) => row.itemId))
  const pending = Object.entries(input.state.pending).map(([itemId, entry]) => ({
    itemId,
    title: entry.snapshot.title,
    deletedAt: entry.deletedAt,
    error: entry.error,
    product: productRef(entry.productId != null ? input.products.find((product) => product.id === entry.productId) : undefined)
  }))
  const pendingIds = new Set(pending.map((entry) => entry.itemId))

  const missing = input.products
    .filter((product) => !product.sold && !product.concept && product.vintedUrl)
    .flatMap((product) => {
      const id = vintedItemId(product.vintedUrl ?? '')
      if (!id || seen.has(id) || pendingIds.has(id)) {
        return []
      }
      return [{ product: productRef(product)!, url: product.vintedUrl! }]
    })

  return { rows, pending, missing, login: input.login, fetchedAt: now.toISOString() }
}

/** One node of `/api/v2/item_upload/catalogs`. */
export type VintedCatalogNode = { id: number; title: string; catalogs?: VintedCatalogNode[] }

/**
 * The picker walks the category tree one level at a time — Hobby's & verzamelen,
 * then Ruilkaarten, then Losse ruilkaarten — so a leaf id has to be turned back into
 * the titles to click on the way down.
 */
export function catalogPathTo(catalogs: VintedCatalogNode[], catalogId: number): VintedCatalogNode[] | null {
  for (const node of catalogs) {
    if (node.id === catalogId) {
      return [node]
    }
    const below = node.catalogs ? catalogPathTo(node.catalogs, catalogId) : null
    if (below) {
      return [node, ...below]
    }
  }
  return null
}

/** `89.99` → `89,99`, the way the price field wants it typed. */
export function vintedPriceInput(price: number): string {
  return price.toFixed(2).replace('.', ',')
}

/** What the browser side of a relist has to offer the dashboard API. */
export type VintedRelistService = {
  report(products: InventoryProduct[]): Promise<VintedRelistReport>
  /**
   * Delete `itemId` and upload it again. Answers with the new listing's id and URL.
   * A listing that is already in `pending` is uploaded from its snapshot instead.
   */
  relist(itemId: string, products: InventoryProduct[]): Promise<{ itemId: string; url: string; productId: number | null }>
}

/** How long Vinted is left alone after it says it is rate limiting this computer. */
export const RATE_LIMIT_COOLDOWN_MS = 30 * 60_000

/** An error the user has to act on (log in, clear a check) rather than a bug. */
export class VintedRelistError extends Error {
  constructor(
    message: string,
    readonly status = 500
  ) {
    super(message)
    this.name = 'VintedRelistError'
  }
}
