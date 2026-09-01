import type { PublicCmsPayload } from './types'
import { normalizePagePath } from '../../worker/hosts'

export function isCmsReadyForPath(
  payload: PublicCmsPayload | null,
  resolvedPath: string | null,
  pathname: string
): boolean {
  if (payload == null || resolvedPath == null) {
    return false
  }

  return normalizePagePath(resolvedPath) === normalizePagePath(pathname)
}
