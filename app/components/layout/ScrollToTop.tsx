import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'

export default function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const previousPathname = useRef(pathname)

  useLayoutEffect(() => {
    const pathnameChanged = previousPathname.current !== pathname
    previousPathname.current = pathname

    if (hash) {
      const id = decodeURIComponent(hash.slice(1))
      const el = id ? document.getElementById(id) : null
      if (el) {
        el.scrollIntoView({ behavior: pathnameChanged ? 'instant' : 'smooth' })
        return
      }
    }

    if (pathnameChanged) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }, [pathname, hash])

  return null
}
