import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { normalizePagePath } from '../../worker/hosts'
import { setCmsMediaCopy } from '~/services/imageCopy'
import { isCmsReadyForPath } from './ready'
import type { PublicCmsPayload } from './types'

type CmsContextValue = {
  payload: PublicCmsPayload | null
  loading: boolean
}

const CmsContext = createContext<CmsContextValue>({ payload: null, loading: true })

function applyMediaCopy(payload: PublicCmsPayload | null) {
  setCmsMediaCopy(payload?.mediaCopy)
}

function initialResolvedPath(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.__CMS__ ? normalizePagePath(window.location.pathname) : null
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
  const [payload, setPayload] = useState<PublicCmsPayload | null>(() => {
    const initial = typeof window === 'undefined' ? null : (window.__CMS__ ?? null)
    applyMediaCopy(initial)
    return initial
  })
  const [resolvedPath, setResolvedPath] = useState<string | null>(initialResolvedPath)
  const loading = !isCmsReadyForPath(payload, resolvedPath, currentPath)

  useEffect(() => {
    if (isCmsReadyForPath(payload, resolvedPath, currentPath)) {
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
        setPayload(next)
        setResolvedPath(currentPath)
        if (typeof window !== 'undefined') {
          window.__CMS__ = next
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [currentPath, payload, resolvedPath])

  const value = useMemo(
    () => ({
      payload,
      loading
    }),
    [payload, loading]
  )

  return <CmsContext.Provider value={value}>{children}</CmsContext.Provider>
}
