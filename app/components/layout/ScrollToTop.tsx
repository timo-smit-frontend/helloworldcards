import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'

function scrollToTopInstant() {
  const html = document.documentElement
  const { body } = document
  const previousHtml = html.style.scrollBehavior
  const previousBody = body.style.scrollBehavior

  html.style.scrollBehavior = 'auto'
  body.style.scrollBehavior = 'auto'
  window.scrollTo(0, 0)
  html.scrollTop = 0
  body.scrollTop = 0
  html.style.scrollBehavior = previousHtml
  body.style.scrollBehavior = previousBody
}

export default function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const previousPathname = useRef(pathname)

  useLayoutEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    const pathnameChanged = previousPathname.current !== pathname
    previousPathname.current = pathname

    if (hash) {
      const id = decodeURIComponent(hash.slice(1))
      const el = id ? document.getElementById(id) : null
      if (el) {
        el.scrollIntoView({ behavior: pathnameChanged ? 'auto' : 'smooth' })
        return
      }
    }

    if (pathnameChanged) {
      scrollToTopInstant()
    }
  }, [pathname, hash])

  useEffect(() => {
    if (hash) return

    scrollToTopInstant()

    let innerFrame = 0
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(scrollToTopInstant)
    })

    return () => {
      cancelAnimationFrame(outerFrame)
      cancelAnimationFrame(innerFrame)
    }
  }, [pathname, hash])

  return null
}
