import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { isAdminPath } from '~/admin/runtime'
import { useCms } from '~/cms/context'
import { adminSeo, getSeoForPayload } from '~/seo/cms'
import { getSeoForPath } from '~/seo/pages'
import { SITE_LOCALE, SITE_NAME, SITE_THEME_COLOR } from '~/seo/site'

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attribute}="${key}"]`
  let element = document.head.querySelector<HTMLMetaElement>(selector)

  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }

  element.setAttribute('content', content)
}

function upsertLink(rel: string, href: string | null) {
  const selector = `link[rel="${rel}"]`
  let element = document.head.querySelector<HTMLLinkElement>(selector)

  if (!href) {
    element?.remove()
    return
  }

  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }

  element.setAttribute('href', href)
}

function upsertJsonLd(data: Record<string, unknown>) {
  const id = 'seo-jsonld'
  let element = document.head.querySelector<HTMLScriptElement>(`script#${id}`)

  if (!element) {
    element = document.createElement('script')
    element.id = id
    element.type = 'application/ld+json'
    document.head.appendChild(element)
  }

  element.textContent = JSON.stringify(data).replace(/</g, '\\u003c')
}

export default function Seo({ admin }: { admin?: boolean }) {
  const { pathname } = useLocation()
  const cms = useCms()
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname

  useEffect(() => {
    const seo = admin || isAdminPath(pathname, hostname) ? adminSeo() : cms ? getSeoForPayload(pathname, cms) : getSeoForPath(pathname)

    document.title = seo.title
    upsertMeta('name', 'description', seo.description)
    upsertMeta('name', 'robots', seo.robots)
    upsertMeta('name', 'theme-color', SITE_THEME_COLOR)
    upsertLink('canonical', seo.canonical)
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:locale', SITE_LOCALE)
    upsertMeta('property', 'og:type', seo.type)
    upsertMeta('property', 'og:title', seo.title)
    upsertMeta('property', 'og:description', seo.description)
    upsertMeta('property', 'og:image', seo.image)
    upsertMeta('property', 'og:image:alt', seo.imageAlt)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', seo.title)
    upsertMeta('name', 'twitter:description', seo.description)
    upsertMeta('name', 'twitter:image', seo.image)
    upsertMeta('name', 'twitter:image:alt', seo.imageAlt)

    if (seo.canonical) {
      upsertMeta('property', 'og:url', seo.canonical)
    } else {
      document.head.querySelector('meta[property="og:url"]')?.remove()
    }

    upsertJsonLd(seo.jsonLd)
  }, [admin, cms, hostname, pathname])

  return null
}
