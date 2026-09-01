import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { setCmsMediaCopy } from '~/services/imageCopy'
import type { PublicCmsPayload } from './types'

const CmsContext = createContext<PublicCmsPayload | null>(null)

function applyMediaCopy(payload: PublicCmsPayload | null) {
  setCmsMediaCopy(payload?.mediaCopy)
}

export function useCms(): PublicCmsPayload | null {
  return useContext(CmsContext)
}

export function CmsProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [payload, setPayload] = useState<PublicCmsPayload | null>(() => {
    const initial = typeof window === 'undefined' ? null : (window.__CMS__ ?? null)
    applyMediaCopy(initial)
    return initial
  })

  useEffect(() => {
    let cancelled = false
    const path = location.pathname

    void fetch(`/api/public?path=${encodeURIComponent(path)}`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((next: PublicCmsPayload | null) => {
        if (!cancelled && next) {
          applyMediaCopy(next)
          setPayload(next)
          if (typeof window !== 'undefined') {
            window.__CMS__ = next
          }
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [location.pathname])

  const value = useMemo(() => payload, [payload])
  return <CmsContext.Provider value={value}>{children}</CmsContext.Provider>
}
