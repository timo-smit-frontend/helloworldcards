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
  description?: string | null
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

/** One row of the flight data: a string outlined on its own, or a line of JSON and the like. */
export type VintedFlightRow = { kind: 'text'; value: string } | { kind: 'line'; value: string }

/**
 * The flight data row by row, keyed on the row's id (in hex).
 *
 * A row is `<id>:<data>` up to the end of the line — except that a string of 1 KB or
 * more, such as a long description, is not written where it belongs. It gets a text
 * row of its own, `c0:T45f,<the text>`, and where it belongs the model says `"$c0"`
 * instead. The text can hold newlines, so a text row does not end at one: its header
 * carries the length in UTF-8 bytes, and the next row follows straight after.
 */
export function vintedFlightRows(flight: string): Map<string, VintedFlightRow> {
  const rows = new Map<string, VintedFlightRow>()
  const header = /([0-9a-f]+):(?:T([0-9a-f]+),)?/y
  let at = 0
  while (at < flight.length) {
    header.lastIndex = at
    const match = header.exec(flight)
    if (!match) {
      // Not the start of a row: pick the rows up again from the next line.
      const newline = flight.indexOf('\n', at)
      if (newline === -1) {
        break
      }
      at = newline + 1
      continue
    }
    const [head, id, textBytes] = match
    at += head.length
    if (textBytes !== undefined) {
      const text = utf8Prefix(flight, at, parseInt(textBytes, 16))
      rows.set(id, { kind: 'text', value: text })
      at += text.length
    } else {
      const end = flight.indexOf('\n', at)
      rows.set(id, { kind: 'line', value: end === -1 ? flight.slice(at) : flight.slice(at, end) })
      at = end === -1 ? flight.length : end + 1
    }
  }
  return rows
}

/** The run of `text` from `start` that takes up `bytes` bytes in UTF-8. */
function utf8Prefix(text: string, start: number, bytes: number): string {
  let end = start
  let taken = 0
  while (end < text.length && taken < bytes) {
    const code = text.codePointAt(end) ?? 0
    taken += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    end += code >= 0x10000 ? 2 : 1
  }
  return text.slice(start, end)
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
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * A model with its `$` strings made good.
 *
 * RSC spells things it cannot put in JSON as strings that start with `$`: `$undefined`
 * for a missing value, `$$…` for a string that starts with a dollar itself, and `$c0`
 * for the row with id c0 — a long string, or an object the page uses in more than one
 * place. The rest of what `$` can introduce (a lazy component, a promise, a date) has
 * no place in a listing, and is refused rather than typed into one word for word.
 */
function followFlightRefs(value: unknown, rows: Map<string, VintedFlightRow>): unknown {
  if (typeof value === 'string') {
    return followFlightRef(value, rows)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => followFlightRefs(entry, rows))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, followFlightRefs(entry, rows)]))
  }
  return value
}

function followFlightRef(value: string, rows: Map<string, VintedFlightRow>): unknown {
  if (!value.startsWith('$')) {
    return value
  }
  if (value === '$undefined') {
    return null
  }
  if (value.startsWith('$$')) {
    return value.slice(1)
  }
  const id = value.match(/^\$([0-9a-f]+)$/)?.[1]
  if (id === undefined) {
    throw new VintedRelistError(
      `Could not read the listing off its edit page: it holds "${value}", a kind of value this reader does not know.`
    )
  }
  const row = rows.get(id)
  if (!row) {
    throw new VintedRelistError(`Could not read the listing off its edit page: it refers to "${value}", which is not on the page.`)
  }
  if (row.kind === 'text') {
    return row.value
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(row.value)
  } catch {
    throw new VintedRelistError(`Could not read the listing off its edit page: "${value}" points at a row that is not data.`)
  }
  return followFlightRefs(parsed, rows)
}

/** The signed photo URL, with the `&` the flight data spells as a `u0026` escape restored. */
function photoUrl(url: string): string {
  return url.replace(/\\u0026/g, '&')
}

/**
 * Read a listing's `itemEditModel` (and its photos) off `/items/{id}/edit`.
 *
 * Null when the page has no listing on it. A page whose listing cannot be read whole —
 * a description that is a reference to a row that is not there — throws instead, so
 * that a relist stops before it deletes anything.
 */
export function parseVintedSnapshot(html: string): VintedSnapshot | null {
  const flight = vintedFlightData(html)
  const outline = jsonAfterKey<EditModel>(flight, 'itemEditModel')
  if (!outline) {
    return null
  }
  const rows = vintedFlightRows(flight)
  const model = followFlightRefs(outline, rows) as EditModel
  if (model.id == null || !model.title || model.catalogId == null) {
    return null
  }

  // The photos sit next to the model rather than in it, right after it closes.
  const modelStart = flight.indexOf('"itemEditModel":')
  const modelRaw = balancedJson(flight, modelStart + '"itemEditModel":'.length) ?? ''
  const photoText = flight.slice(modelStart + modelRaw.length)
  const photos = (followFlightRefs(jsonAfterKey<EditPhoto[]>(photoText, 'photos') ?? [], rows) as EditPhoto[])
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
  /** Relists finished by hand since the last look; their products still point at the old listing. */
  byHand: VintedHandRelist[]
  /** Which Vinted account the wardrobe belongs to. */
  login: string | null
  fetchedAt: string
}

/** A pending relist that turned out to be done: the seller uploaded the listing again themselves. */
export type VintedHandRelist = { itemId: string; previousItemId: string; productId: number | null; url: string }

function sameTitle(a: string, b: string): boolean {
  const fold = (title: string) => title.replace(/\s+/g, ' ').trim().toLowerCase()
  return fold(a) === fold(b)
}

/**
 * Settle the pending relists the seller finished by hand.
 *
 * A relist that failed after its delete leaves the upload form open in the Chrome
 * window, and the seller may well finish it there. The tool then sees a listing with
 * the pending one's title in the wardrobe, newer than the one it deleted — Vinted's
 * ids only go up — and takes that as the relist done: the pending entry becomes a
 * record of the new listing, as if the upload had gone through here. What is settled
 * is handed back so the products can be pointed at their new listings.
 */
export function settlePendingByHand(state: VintedRelistState, wardrobe: VintedWardrobeItem[], now = new Date()): VintedHandRelist[] {
  const settled: VintedHandRelist[] = []
  for (const [previousItemId, entry] of Object.entries(state.pending)) {
    const replacement = wardrobe
      .filter((item) => !item.is_closed && item.id > Number(previousItemId) && sameTitle(item.title, entry.snapshot.title))
      .sort((a, b) => b.id - a.id)[0]
    if (!replacement) {
      continue
    }
    const itemId = String(replacement.id)
    const uploadedAt = wardrobeUploadedAt(replacement, now)
    delete state.pending[previousItemId]
    delete state.records[previousItemId]
    state.records[itemId] = {
      itemId,
      previousItemId,
      productId: entry.productId,
      listedAt: uploadedAt != null ? new Date(uploadedAt).toISOString() : now.toISOString()
    }
    settled.push({ itemId, previousItemId, productId: entry.productId, url: vintedItemUrl(itemId) })
  }
  return settled
}

/**
 * Whether a wardrobe listing's title names this card.
 *
 * Listing titles follow `Pikachu 160/159 - PSA 9 - Crown Zenith`: the card's name
 * first, then its grade between dashes. The name alone is not enough — Mewtwo and
 * Mewtwo GX both start with "Mewtwo" — so the grade segment has to be there too,
 * and the name must end where a word ends.
 */
export function listingTitleNamesProduct(title: string, product: Pick<InventoryProduct, 'title' | 'grader' | 'grade'>): boolean {
  const fold = (text: string) => text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase()
  const listing = fold(title)
  const name = fold(product.title)
  if (!name || !listing.startsWith(name) || /\w/.test(listing.charAt(name.length))) {
    return false
  }
  if (!product.grader || product.grade == null) {
    return true
  }
  return listing.includes(`- ${fold(product.grader)} ${product.grade} -`)
}

/**
 * Settle the relists the seller did entirely by hand.
 *
 * A card whose listing is gone from the wardrobe, while a newer listing that no
 * product claims is up under the card's title, was deleted and posted again on
 * Vinted itself — after a rate-limit block, say. The tool never saw a delete, so
 * there is no pending entry to settle; the product is pointed at the new listing
 * all the same, or the shop's "View on Vinted" link stays dead. Only a pairing with
 * nothing else it could be is taken: one such listing for the card, one such card
 * for the listing.
 */
export function settleMissingByHand(
  state: VintedRelistState,
  wardrobe: VintedWardrobeItem[],
  products: InventoryProduct[],
  now = new Date()
): VintedHandRelist[] {
  const listed = new Set(wardrobe.map((item) => String(item.id)))
  const claimed = new Set<string>()
  for (const product of products) {
    const id = product.vintedUrl ? vintedItemId(product.vintedUrl) : null
    if (id) claimed.add(id)
  }
  for (const record of Object.values(state.records)) {
    if (listed.has(record.itemId)) claimed.add(record.itemId)
  }
  const unclaimed = () => wardrobe.filter((item) => !item.is_closed && !item.is_draft && !claimed.has(String(item.id)))

  const missing = products.filter((product) => {
    const id = product.vintedUrl ? vintedItemId(product.vintedUrl) : null
    return id && !product.sold && !product.reserved && !product.concept && !listed.has(id) && !state.pending[id]
  })

  const settled: VintedHandRelist[] = []
  for (const product of missing) {
    const previousItemId = vintedItemId(product.vintedUrl!)!
    const candidates = unclaimed().filter((item) => item.id > Number(previousItemId) && listingTitleNamesProduct(item.title, product))
    if (candidates.length !== 1) {
      continue
    }
    const replacement = candidates[0]
    if (missing.filter((other) => listingTitleNamesProduct(replacement.title, other)).length !== 1) {
      continue
    }
    const itemId = String(replacement.id)
    const uploadedAt = wardrobeUploadedAt(replacement, now)
    delete state.records[previousItemId]
    state.records[itemId] = {
      itemId,
      previousItemId,
      productId: product.id,
      listedAt: uploadedAt != null ? new Date(uploadedAt).toISOString() : now.toISOString()
    }
    claimed.add(itemId)
    settled.push({ itemId, previousItemId, productId: product.id, url: vintedItemUrl(itemId) })
  }
  return settled
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
  byHand?: VintedHandRelist[]
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
  // A listing we relisted knows its product even while the product still names the
  // old listing — as it does until the relist's product update has gone through.
  const byProductId = new Map(input.products.map((product) => [product.id, product]))
  const productOf = (itemId: string): InventoryProduct | undefined => {
    const record = input.state.records[itemId]
    return byItemId.get(itemId) ?? (record?.productId != null ? byProductId.get(record.productId) : undefined)
  }

  const productRef = (product: InventoryProduct | undefined) =>
    product ? { id: product.id, title: product.title, slug: product.slug } : null

  // A reserved card is sold, whatever its listing says: there is nothing to bump, so it
  // leaves the screen rather than sitting there with a button that must not be pressed.
  const forSale = input.wardrobe.filter((item) => productOf(String(item.id))?.reserved !== true)

  const rows: VintedRelistRow[] = forSale.map((item) => {
    const itemId = String(item.id)
    const product = productOf(itemId)
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

  // Oldest first: the ones most in need of a relist sit at the top. Within the same day the
  // exact upload time decides (today's listings run from the earliest to the latest bump);
  // the title only breaks a tie when that time is not known for both.
  const listedTime = (row: VintedRelistRow) => (row.listedAt ? new Date(row.listedAt).getTime() : Number.NaN)
  const byListedTime = (a: VintedRelistRow, b: VintedRelistRow) => {
    const diff = listedTime(a) - listedTime(b)
    return Number.isNaN(diff) ? 0 : diff
  }
  rows.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1) || byListedTime(a, b) || a.title.localeCompare(b.title))

  const seen = new Set(input.wardrobe.map((item) => String(item.id)))
  const pending = Object.entries(input.state.pending).map(([itemId, entry]) => ({
    itemId,
    title: entry.snapshot.title,
    deletedAt: entry.deletedAt,
    error: entry.error,
    product: productRef(entry.productId != null ? input.products.find((product) => product.id === entry.productId) : undefined)
  }))
  const pendingIds = new Set(pending.map((entry) => entry.itemId))
  // The old ids of relisted listings whose replacements are up: a product still naming one is not missing.
  const replaced = new Set(
    Object.values(input.state.records)
      .filter((record) => seen.has(record.itemId))
      .map((record) => record.previousItemId)
  )

  const missing = input.products
    .filter((product) => !product.sold && !product.reserved && !product.concept && product.vintedUrl)
    .flatMap((product) => {
      const id = vintedItemId(product.vintedUrl ?? '')
      if (!id || seen.has(id) || pendingIds.has(id) || replaced.has(id)) {
        return []
      }
      return [{ product: productRef(product)!, url: product.vintedUrl! }]
    })

  return { rows, pending, missing, byHand: input.byHand ?? [], login: input.login, fetchedAt: now.toISOString() }
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
export type VintedRelistOptions = {
  price?: number
}

export type VintedRelistService = {
  report(products: InventoryProduct[]): Promise<VintedRelistReport>
  /**
   * Delete `itemId` and upload it again. Answers with the new listing's id and URL.
   * A listing that is already in `pending` is uploaded from its snapshot instead.
   * `options.price` (euros, e.g. `59.99`) replaces the listing's price on the copy,
   * for a price change that should also bump the listing.
   */
  relist(
    itemId: string,
    products: InventoryProduct[],
    options?: VintedRelistOptions
  ): Promise<{ itemId: string; url: string; productId: number | null }>
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
