import { json, normalizeApiPath, readJson } from './http'
import {
  deleteMedia,
  deleteMediaFolder,
  getMediaById,
  getMediaFolderById,
  insertMedia,
  insertMediaFolder,
  mediaFolderNameTaken,
  mediaLibrarySnapshot,
  renameMediaFolder,
  replaceMediaFile,
  updateMedia,
  type CmsDb,
  type MediaUpdate
} from './db'
import { getR2Usage, incrementR2Usage, snapshotR2Usage, usageMonth } from './r2-usage'
import { ensureSeeded } from './seed'
import type { DashboardEnv, DashboardRuntime } from '../dashboard-api'
import {
  BUILD_WIDTHS,
  allMediaVariantKeys,
  mediaVariantKey,
  parseRasterVariant,
  type ImageFormat
} from '../../app/services/responsiveImage'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_FOLDER_NAME_LENGTH = 60
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
const ORIGINAL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const
// Same contract as denofdata.com CMS media: browsers keep a year, shared caches a week.
const MEDIA_CACHE_CONTROL = 'public, immutable, max-age=31536000, s-maxage=604800'
// A stand-in — the WebP for an AVIF, a smaller size, the original — is only right until
// the real file is uploaded, so it is kept for minutes at the edge, not a week.
const FALLBACK_CACHE_CONTROL = 'public, max-age=3600, s-maxage=600'

export type MediaCache = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete?(request: Request): Promise<boolean>
}

/** What comes back from the bucket: R2's object, or the in-memory stand-in below. */
type MediaObject = {
  arrayBuffer(): Promise<ArrayBuffer>
  /** Streamed straight through to the response where the bucket offers it. */
  body?: ReadableStream | null
  httpMetadata?: { contentType?: string }
  httpEtag?: string
  size?: number
}

type MediaObjectHead = Omit<MediaObject, 'arrayBuffer' | 'body'>

export type MediaBucket = {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<MediaObject | null>
  /** Metadata without the bytes, for HEAD requests. */
  head?(key: string): Promise<MediaObjectHead | null>
  /** R2 deletes a whole list in one call. */
  delete(keys: string | string[]): Promise<void>
}

function dbOf(env: DashboardEnv, runtime?: DashboardRuntime): CmsDb | null {
  return runtime?.db ?? env.DB ?? null
}

function bucketOf(env: DashboardEnv, runtime?: DashboardRuntime): MediaBucket | null {
  return runtime?.media ?? env.MEDIA ?? null
}

function slugKey(filename: string): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${Date.now().toString(36)}-${safe || 'upload'}`
}

function cacheRequest(url: string): Request {
  return new Request(url, { method: 'GET' })
}

function edgeCache(runtime?: DashboardRuntime): MediaCache | undefined {
  if (runtime?.mediaCache) {
    return runtime.mediaCache
  }
  const cachesRef = (globalThis as unknown as { caches?: { default?: MediaCache } }).caches
  return cachesRef?.default
}

/** Let the request finish first; the work is kept alive by the runtime where there is one. */
function inBackground(runtime: DashboardRuntime | undefined, work: () => Promise<unknown>): Promise<void> {
  const task = work().then(
    () => undefined,
    () => undefined
  )
  if (runtime?.ctx) {
    runtime.ctx.waitUntil(task)
    return Promise.resolve()
  }
  return task
}

function contentTypeOf(object: MediaObjectHead): string {
  return object.httpMetadata?.contentType ?? 'application/octet-stream'
}

/** The original a key belongs to, minus its extension: `hero-w800.webp` and `hero.jpg` both give `hero`. */
function familyOf(key: string): string {
  return parseRasterVariant(`/media/${key}`)?.stem.replace(/^.*\//, '') ?? key.replace(/\.[a-z0-9]+$/i, '')
}

function mediaHeaders(object: MediaObjectHead, key: string, servedKey: string): Headers {
  const headers = new Headers({
    'Content-Type': contentTypeOf(object),
    'Cache-Control': servedKey === key ? MEDIA_CACHE_CONTROL : FALLBACK_CACHE_CONTROL,
    'Cache-Tag': `media,media-${familyOf(key)}`,
    'X-Media-Served-Key': servedKey
  })
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag)
  }
  if (object.size != null) {
    headers.set('Content-Length', String(object.size))
  }
  return headers
}

function etagMatches(request: Request, etag: string | null): boolean {
  const wanted = request.headers.get('If-None-Match')
  if (!wanted || !etag) {
    return false
  }
  const strip = (value: string) => value.trim().replace(/^W\//, '')
  return wanted.split(',').some((candidate) => candidate.trim() === '*' || strip(candidate) === strip(etag))
}

function notModified(headers: Headers): Response {
  const kept = new Headers()
  for (const name of ['Cache-Control', 'Cache-Tag', 'ETag', 'X-Media-Served-Key']) {
    const value = headers.get(name)
    if (value) {
      kept.set(name, value)
    }
  }
  return new Response(null, { status: 304, headers: kept })
}

function expectedVariantContentType(key: string): string | null {
  if (key.endsWith('.avif')) return 'image/avif'
  if (key.endsWith('.webp')) return 'image/webp'
  return null
}

function isStaleVariantCache(key: string, cached: Response): boolean {
  const expected = expectedVariantContentType(key)
  if (!expected) {
    return false
  }
  const served = cached.headers.get('X-Media-Served-Key')
  if (!served) {
    return cached.headers.get('Content-Type') !== expected
  }
  // A cached resize stays good even when it is a WebP standing in for AVIF; only a
  // cached original has to be dropped once the real resizes land in R2.
  return served !== key && expectedVariantContentType(served) === null
}

/**
 * The keys that may answer a request, best first. The exact key comes first; for a
 * resize that is not there yet — the admin only makes WebP, and only up to the picture's
 * own width, until the next media sync — the WebP of the same width stands in for an
 * AVIF, then the largest smaller WebP, and only then the original, which can be many
 * times the size of any resize.
 */
export function mediaCandidates(key: string): string[] {
  const variant = parseRasterVariant(`/media/${key}`)
  if (!variant) {
    return [key]
  }
  const base = variant.stem.replace(/^.*\//, '')
  const candidates = [key]
  if (variant.format === 'avif') {
    candidates.push(`${base}-w${variant.width}.webp`)
  }
  for (const width of [...BUILD_WIDTHS].filter((candidate) => candidate < variant.width).sort((a, b) => b - a)) {
    candidates.push(`${base}-w${width}.webp`)
  }
  for (const extension of ORIGINAL_EXTENSIONS) {
    candidates.push(`${base}${extension}`)
  }
  return candidates
}

type Resolved<T> = { object: T; servedKey: string; operations: number }

async function resolveFirst<T>(key: string, lookup: (candidate: string) => Promise<T | null>): Promise<Resolved<T> | null> {
  let operations = 0
  for (const candidate of mediaCandidates(key)) {
    operations += 1
    const object = await lookup(candidate)
    if (object) {
      return { object, servedKey: candidate, operations }
    }
  }
  return null
}

export function memoryR2(): MediaBucket {
  const files = new Map<string, { body: Uint8Array; contentType: string; etag: string }>()
  const describe = (key: string): (MediaObjectHead & { bytes: Uint8Array }) | null => {
    const file = files.get(key)
    return file
      ? { httpMetadata: { contentType: file.contentType }, httpEtag: file.etag, size: file.body.byteLength, bytes: file.body }
      : null
  }
  return {
    async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }) {
      const body = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value)
      // Not R2's MD5, but unique to the bytes stored under the key, which is all an ETag has to be.
      let hash = 0
      for (const byte of body) {
        hash = (hash * 31 + byte) >>> 0
      }
      files.set(key, {
        body,
        contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream',
        etag: `"${hash.toString(16)}-${body.byteLength}"`
      })
      return { key }
    },
    async get(key: string) {
      const file = describe(key)
      if (!file) {
        return null
      }
      const { bytes, ...head } = file
      return {
        ...head,
        body: new Blob([Uint8Array.from(bytes)]).stream(),
        arrayBuffer: async () => Uint8Array.from(bytes).buffer as ArrayBuffer
      }
    },
    async head(key: string) {
      const file = describe(key)
      if (!file) {
        return null
      }
      return { httpMetadata: file.httpMetadata, httpEtag: file.httpEtag, size: file.size }
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        files.delete(key)
      }
    }
  }
}

function validateUpload(file: unknown): { file: File; contentType: string } | Response {
  if (!(file instanceof File)) {
    return json({ error: 'Choose an image to upload.' }, 400)
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: 'That image is too large.' }, 400)
  }
  const contentType = file.type || 'application/octet-stream'
  if (!ALLOWED_TYPES.has(contentType)) {
    return json({ error: 'Upload a JPEG, PNG, WebP, GIF, or SVG.' }, 400)
  }
  return { file, contentType }
}

const VARIANT_UPLOAD_NAME = /^w(\d+)\.(webp|avif)$/
const VARIANT_WIDTHS = new Set<number>(BUILD_WIDTHS)

// The admin re-encodes every upload into the same widths the site build produces and
// sends them along, so thumbnails and the detail view never pull the full original.
function uploadedVariants(form: FormData, key: string): Array<{ key: string; file: File; contentType: string }> {
  const variants: Array<{ key: string; file: File; contentType: string }> = []
  for (const entry of form.getAll('variant')) {
    if (!(entry instanceof File) || entry.size > MAX_UPLOAD_BYTES) {
      continue
    }
    const parsed = entry.name.match(VARIANT_UPLOAD_NAME)
    if (!parsed || !VARIANT_WIDTHS.has(Number(parsed[1]))) {
      continue
    }
    const format = parsed[2] as ImageFormat
    const variantKey = mediaVariantKey(key, Number(parsed[1]), format)
    if (variantKey === key) {
      continue
    }
    variants.push({ key: variantKey, file: entry, contentType: format === 'avif' ? 'image/avif' : 'image/webp' })
  }
  return variants
}

/**
 * Store an upload and the resizes that came with it. The writes go out together rather
 * than one after another, and the usage counter is bumped once for the lot.
 */
async function storeUpload(
  bucket: MediaBucket,
  db: CmsDb,
  key: string,
  bytes: ArrayBuffer,
  contentType: string,
  form: FormData
): Promise<void> {
  const variants = uploadedVariants(form, key)
  await Promise.all([
    bucket.put(key, bytes, { httpMetadata: { contentType } }),
    ...variants.map(async (variant) =>
      bucket.put(variant.key, await variant.file.arrayBuffer(), { httpMetadata: { contentType: variant.contentType } })
    )
  ])
  await incrementR2Usage(db, { classA: 1 + variants.length })
}

/**
 * Replacing or deleting a key must clear the original and every derived variant from
 * R2 and the edge, otherwise stale renditions keep being served under the same URL.
 * R2 takes the whole list in one call, and so does the cache purge.
 */
async function dropMediaCopies(key: string, requestUrl: string, bucket: MediaBucket, runtime: DashboardRuntime | undefined): Promise<void> {
  const keys = [key, ...allMediaVariantKeys(key)]
  const pathnames = keys.map((objectKey) => `/media/${objectKey}`)
  const cache = edgeCache(runtime)
  await Promise.all([
    bucket.delete(keys),
    runtime?.purgeMediaCache?.(pathnames),
    ...(cache?.delete ? pathnames.map((pathname) => cache.delete!(cacheRequest(new URL(pathname, requestUrl).href))) : [])
  ])
}

export async function handleMediaPublic(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response | null> {
  const url = new URL(request.url)
  const path = normalizeApiPath(url.pathname)
  const match = path.match(/^\/media\/(.+)$/)
  if (!match || (request.method !== 'GET' && request.method !== 'HEAD')) {
    return null
  }

  const bucket = bucketOf(env, runtime)
  if (!bucket) {
    return json({ error: 'Media is not available.' }, 503)
  }

  const key = decodeURIComponent(match[1])
  const cacheKey = cacheRequest(new URL(`/media/${key}`, url.origin).href)
  const cache = edgeCache(runtime)
  const cached = await cache?.match(cacheKey)
  if (cached && !isStaleVariantCache(key, cached)) {
    if (etagMatches(request, cached.headers.get('ETag'))) {
      return notModified(cached.headers)
    }
    return request.method === 'HEAD' ? new Response(null, { headers: cached.headers }) : cached
  }

  // A HEAD needs the metadata alone, which R2 answers without moving the bytes.
  const resolved =
    request.method === 'HEAD' && bucket.head
      ? await resolveFirst(key, (candidate) => bucket.head!(candidate))
      : await resolveFirst<MediaObject>(key, (candidate) => bucket.get(candidate))

  const db = dbOf(env, runtime)
  const operations = resolved?.operations ?? mediaCandidates(key).length
  const counted = db ? inBackground(runtime, () => incrementR2Usage(db, { classB: operations })) : Promise.resolve()

  if (!resolved) {
    await counted
    return json({ error: 'Not found' }, 404)
  }

  const { object, servedKey } = resolved
  const headers = mediaHeaders(object, key, servedKey)
  if (etagMatches(request, headers.get('ETag'))) {
    if ('body' in object) {
      await (object as MediaObject).body?.cancel().catch(() => undefined)
    }
    await counted
    return notModified(headers)
  }

  if (request.method === 'HEAD') {
    if ('body' in object) {
      await (object as MediaObject).body?.cancel().catch(() => undefined)
    }
    await counted
    return new Response(null, { headers })
  }

  const full = object as MediaObject
  const response = new Response(full.body ?? (await full.arrayBuffer()), { headers })
  if (cache) {
    const stored = response.clone()
    await inBackground(runtime, () => cache.put(cacheKey, stored))
  }
  await counted
  return response
}

/** A folder name as the grid will show it: trimmed, single-spaced, and short enough for a tile. */
function parseFolderName(value: unknown): string | Response {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name) {
    return json({ error: 'Give the folder a name.' }, 400)
  }
  if (name.length > MAX_FOLDER_NAME_LENGTH) {
    return json({ error: `Keep the folder name under ${MAX_FOLDER_NAME_LENGTH} characters.` }, 400)
  }
  return name
}

/**
 * The folder an image is being put in: a folder id, or null for the top of the library.
 * Anything that is not one of those is left as undefined, meaning "not sent".
 */
function parseFolderId(value: unknown): number | null | undefined {
  if (value === null || value === '') {
    return null
  }
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value)
  }
  return undefined
}

export async function handleMediaRequest(request: Request, env: DashboardEnv, runtime?: DashboardRuntime): Promise<Response | null> {
  const path = normalizeApiPath(new URL(request.url).pathname)
  if (!path.startsWith('/api/admin/media')) {
    return null
  }

  const db = dbOf(env, runtime)
  const bucket = bucketOf(env, runtime)
  if (!db || !bucket) {
    return json({ error: 'Media is not available.' }, 503)
  }
  await ensureSeeded(db)

  if (path === '/api/admin/media' && request.method === 'GET') {
    const month = usageMonth()
    const { media, folders, storageBytes, classA, classB } = await mediaLibrarySnapshot(db, month)
    return json({ media, folders, r2: snapshotR2Usage(month, storageBytes, classA, classB) })
  }

  if (path === '/api/admin/media/folders' && request.method === 'POST') {
    const body = await readJson<Record<string, unknown>>(request)
    if (!body) {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const name = parseFolderName(body.name)
    if (name instanceof Response) {
      return name
    }
    if (await mediaFolderNameTaken(db, name)) {
      return json({ error: 'There is already a folder with that name.' }, 400)
    }
    const id = await insertMediaFolder(db, name)
    return json({ folder: { id, name } }, 201)
  }

  const folderMatch = path.match(/^\/api\/admin\/media\/folders\/(\d+)$/)
  if (folderMatch && request.method === 'PUT') {
    const id = Number(folderMatch[1])
    const body = await readJson<Record<string, unknown>>(request)
    if (!body) {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const name = parseFolderName(body.name)
    if (name instanceof Response) {
      return name
    }
    if (await mediaFolderNameTaken(db, name, id)) {
      return json({ error: 'There is already a folder with that name.' }, 400)
    }
    if (!(await renameMediaFolder(db, id, name))) {
      return json({ error: 'Not found' }, 404)
    }
    return json({ folder: { id, name } })
  }

  if (folderMatch && request.method === 'DELETE') {
    // The images inside are kept; they go back to the top of the library.
    return (await deleteMediaFolder(db, Number(folderMatch[1]))) ? json({ ok: true }) : json({ error: 'Not found' }, 404)
  }

  if (path === '/api/admin/media' && request.method === 'POST') {
    const form = await request.formData()
    const validated = validateUpload(form.get('file'))
    if (validated instanceof Response) {
      return validated
    }
    const { file, contentType } = validated
    // An upload made from inside a folder lands in that folder.
    const folderId = parseFolderId(form.get('folderId')) ?? null
    if (folderId != null && !(await getMediaFolderById(db, folderId))) {
      return json({ error: 'That folder no longer exists.' }, 400)
    }
    const key = slugKey(file.name)
    const bytes = await file.arrayBuffer()
    await storeUpload(bucket, db, key, bytes, contentType, form)
    const createdAt = new Date().toISOString()
    const media = {
      key,
      filename: file.name,
      contentType,
      width: null,
      height: null,
      bytes: bytes.byteLength,
      title: '',
      alt: '',
      createdAt,
      folderId
    }
    const id = await insertMedia(db, media)
    // The usage figures travel with the answer, so the admin need not ask for the
    // whole library again just to refresh its storage widget.
    return json(
      {
        media: {
          id,
          ...media,
          url: `/media/${key}`
        },
        r2: await getR2Usage(db)
      },
      201
    )
  }

  const fileMatch = path.match(/^\/api\/admin\/media\/(\d+)\/file$/)
  if (fileMatch && request.method === 'POST') {
    const form = await request.formData()
    const validated = validateUpload(form.get('file'))
    if (validated instanceof Response) {
      return validated
    }
    const existing = await getMediaById(db, Number(fileMatch[1]))
    if (!existing) {
      return json({ error: 'Not found' }, 404)
    }
    const { file, contentType } = validated
    const bytes = await file.arrayBuffer()
    const key = slugKey(file.name)
    // The new bytes land first, so the library never points at a key that is not there.
    // A fresh key means caches can never serve the old picture; every page, product,
    // and setting that pointed at the old URL is repointed to this one.
    await storeUpload(bucket, db, key, bytes, contentType, form)
    const media = await replaceMediaFile(db, existing, {
      key,
      filename: file.name,
      contentType,
      bytes: bytes.byteLength
    })
    await dropMediaCopies(existing.key, request.url, bucket, runtime)
    return json({ media })
  }

  const match = path.match(/^\/api\/admin\/media\/(\d+)$/)
  if (match && request.method === 'PUT') {
    const body = await readJson<Record<string, unknown>>(request)
    if (!body) {
      return json({ error: 'Invalid JSON' }, 400)
    }
    // Only what was sent is written: the copy comes from the details form, the folder
    // from a drag or the folder picker, and neither should wipe the other.
    const fields: MediaUpdate = {}
    if ('title' in body) {
      fields.title = typeof body.title === 'string' ? body.title.trim() : ''
    }
    if ('alt' in body) {
      fields.alt = typeof body.alt === 'string' ? body.alt.trim() : ''
    }
    if ('folderId' in body) {
      const folderId = parseFolderId(body.folderId)
      if (folderId === undefined) {
        return json({ error: 'Choose a folder or none.' }, 400)
      }
      if (folderId != null && !(await getMediaFolderById(db, folderId))) {
        return json({ error: 'That folder no longer exists.' }, 400)
      }
      fields.folderId = folderId
    }
    const media = await updateMedia(db, Number(match[1]), fields)
    if (!media) {
      return json({ error: 'Not found' }, 404)
    }
    return json({ media })
  }

  if (match && request.method === 'DELETE') {
    const removed = await deleteMedia(db, Number(match[1]))
    if (!removed) {
      return json({ error: 'Not found' }, 404)
    }
    await dropMediaCopies(removed.key, request.url, bucket, runtime)
    return json({ ok: true })
  }

  return json({ error: 'Not found' }, 404)
}
