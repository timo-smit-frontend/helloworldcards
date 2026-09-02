import { json, normalizeApiPath, readJson } from './http'
import { deleteMedia, insertMedia, listMedia, updateMedia, type CmsDb } from './db'
import { getR2Usage, incrementR2Usage } from './r2-usage'
import { ensureSeeded } from './seed'
import type { DashboardEnv, DashboardRuntime } from '../dashboard-api'
import { allMediaVariantKeys, parseRasterVariant } from '../../app/services/responsiveImage'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
const ORIGINAL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const
// Same contract as denofdata.com CMS media: browsers keep a year, shared caches a week.
const MEDIA_CACHE_CONTROL = 'public, immutable, max-age=31536000, s-maxage=604800'

export type MediaCache = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete?(request: Request): Promise<boolean>
}

export type MediaBucket = {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>
  delete(key: string): Promise<void>
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

async function edgeCache(runtime?: DashboardRuntime): Promise<MediaCache | undefined> {
  if (runtime?.mediaCache) {
    return runtime.mediaCache
  }
  const cachesRef = (globalThis as unknown as { caches?: { default?: MediaCache } }).caches
  return cachesRef?.default
}

function mediaHeaders(contentType: string, key: string, servedKey = key): Headers {
  return new Headers({
    'Content-Type': contentType,
    'Cache-Control': MEDIA_CACHE_CONTROL,
    'Cache-Tag': `media,media-${key}`,
    'X-Media-Served-Key': servedKey
  })
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
  if (cached.headers.get('X-Media-Served-Key') === key) {
    return false
  }
  return cached.headers.get('Content-Type') !== expected
}

async function resolveMediaObject(
  bucket: MediaBucket,
  key: string
): Promise<{ object: NonNullable<Awaited<ReturnType<MediaBucket['get']>>>; servedKey: string } | null> {
  const direct = await bucket.get(key)
  if (direct) {
    return { object: direct, servedKey: key }
  }

  const variant = parseRasterVariant(`/media/${key}`)
  if (!variant) {
    return null
  }

  const base = variant.stem.replace(/^.*\//, '')
  for (const extension of ORIGINAL_EXTENSIONS) {
    const originalKey = `${base}${extension}`
    const object = await bucket.get(originalKey)
    if (object) {
      return { object, servedKey: originalKey }
    }
  }

  return null
}

export function memoryR2(): MediaBucket {
  const files = new Map<string, { body: Uint8Array; contentType: string }>()
  return {
    async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }) {
      const body = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value)
      files.set(key, { body, contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream' })
      return { key }
    },
    async get(key: string) {
      const file = files.get(key)
      if (!file) {
        return null
      }
      return {
        httpMetadata: { contentType: file.contentType },
        arrayBuffer: async () => Uint8Array.from(file.body).buffer as ArrayBuffer
      }
    },
    async delete(key: string) {
      files.delete(key)
    }
  }
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
  const cache = await edgeCache(runtime)
  const cached = await cache?.match(cacheKey)
  if (cached && !isStaleVariantCache(key, cached)) {
    return cached
  }

  const resolved = await resolveMediaObject(bucket, key)
  const db = dbOf(env, runtime)
  if (db) {
    try {
      await incrementR2Usage(db, { classB: 1 })
    } catch {
      // Serving the file matters more than the warning counter.
    }
  }

  if (!resolved) {
    return json({ error: 'Not found' }, 404)
  }

  const { object, servedKey } = resolved
  const type = object.httpMetadata?.contentType ?? 'application/octet-stream'
  const body = request.method === 'HEAD' ? null : await object.arrayBuffer()
  const response = new Response(body, { headers: mediaHeaders(type, key, servedKey) })
  if (cache && request.method === 'GET') {
    const stored = response.clone()
    const put = cache.put(cacheKey, stored)
    if (runtime?.ctx) {
      runtime.ctx.waitUntil(put)
    } else {
      await put
    }
  }
  return response
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
    return json({ media: await listMedia(db), r2: await getR2Usage(db) })
  }

  if (path === '/api/admin/media' && request.method === 'POST') {
    const form = await request.formData()
    const file = form.get('file')
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
    const key = slugKey(file.name)
    const bytes = await file.arrayBuffer()
    await bucket.put(key, bytes, { httpMetadata: { contentType } })
    await incrementR2Usage(db, { classA: 1 })
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
      createdAt
    }
    const id = await insertMedia(db, media)
    return json(
      {
        media: {
          id,
          ...media,
          url: `/media/${key}`
        }
      },
      201
    )
  }

  const match = path.match(/^\/api\/admin\/media\/(\d+)$/)
  if (match && request.method === 'PUT') {
    const body = await readJson<Record<string, unknown>>(request)
    if (!body) {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const alt = typeof body.alt === 'string' ? body.alt.trim() : ''
    const media = await updateMedia(db, Number(match[1]), { title, alt })
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
    await bucket.delete(removed.key)
    const cache = await edgeCache(runtime)
    for (const variantKey of allMediaVariantKeys(removed.key)) {
      await bucket.delete(variantKey)
      const variantPath = `/media/${variantKey}`
      await runtime?.purgeMediaCache?.(variantPath)
      await cache?.delete?.(cacheRequest(new URL(variantPath, request.url).href))
    }
    const pathname = `/media/${removed.key}`
    await runtime?.purgeMediaCache?.(pathname)
    await cache?.delete?.(cacheRequest(new URL(pathname, request.url).href))
    return json({ ok: true })
  }

  return json({ error: 'Not found' }, 404)
}
