import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { normalizePagePath } from '../../worker/hosts'
import { setCmsMediaCopy } from '~/services/imageCopy'
import { readCachedCmsPayload, writeCachedCmsPayload } from './cache'
import type { PublicCmsPayload } from './types'

type CmsContextValue = {
  payload: PublicCmsPayload | null
  loading: boolean
}

const CmsContext = createContext<CmsContextValue>({ payload: null, loading: true })

function applyMediaCopy(payload: PublicCmsPayload | null) {
  setCmsMediaCopy(payload?.mediaCopy)
}

export function useCms(): PublicCmsPayload | null {
  return useContext(CmsContext).payload
}

export function useCmsLoading(): boolean {
  return useContext(CmsContext).loading
}

export function CmsProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const currentPath = normalizePagePath(location.pathname)
  const [cache, setCache] = useState(() => {
    const initial = typeof window === 'undefined' ? null : (window.__CMS__ ?? null)
    applyMediaCopy(initial)

    if (!initial) {
      return new Map<string, PublicCmsPayload>()
    }

    return writeCachedCmsPayload(new Map(), window.location.pathname, initial)
  })
  const payload = readCachedCmsPayload(cache, currentPath)
  const loading = payload == null

  useEffect(() => {
    applyMediaCopy(payload)

    if (payload) {
      return
    }

    let cancelled = false

    void fetch(`/api/public?path=${encodeURIComponent(currentPath)}`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((next: PublicCmsPayload | null) => {
        if (cancelled || !next) {
          return
        }

        applyMediaCopy(next)
        setCache((current) => writeCachedCmsPayload(current, currentPath, next))
        if (typeof window !== 'undefined') {
          window.__CMS__ = next
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [currentPath, payload])

  const value = useMemo(
    () => ({
      payload,
      loading
    }),
    [payload, loading]
  )

  return <CmsContext.Provider value={value}>{children}</CmsContext.Provider>
}
