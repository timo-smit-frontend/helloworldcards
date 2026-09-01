import { normalizePagePath } from '../../worker/hosts'
import type { PublicCmsPayload } from './types'

export type CmsCache = Map<string, PublicCmsPayload>

export function readCachedCmsPayload(cache: CmsCache, pathname: string): PublicCmsPayload | null {
  return cache.get(normalizePagePath(pathname)) ?? null
}

export function writeCachedCmsPayload(cache: CmsCache, pathname: string, payload: PublicCmsPayload): CmsCache {
  const next = new Map(cache)
  next.set(normalizePagePath(pathname), payload)
  return next
}
