import { useEffect, useLayoutEffect } from 'react'
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

function scrollToHash(hash: string, behavior: ScrollBehavior) {
  const id = decodeURIComponent(hash.slice(1))
  const el = id ? document.getElementById(id) : null
  if (!el) return false
  el.scrollIntoView({ behavior })
  return true
}

export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useLayoutEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    if (hash && scrollToHash(hash, 'auto')) return
    scrollToTopInstant()
  }, [pathname, hash])

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || window.location.hash) return
      scrollToTopInstant()
    }

    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

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
