import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { getProductBySlug } from '~/database/products'

function getMailContent(pathname: string): { subject: string; body: string } | undefined {
  const productMatch = pathname.match(/^\/products\/([^/]+)\/?$/)
  const product = productMatch ? getProductBySlug(productMatch[1]) : undefined

  if (!product) {
    return undefined
  }

  return {
    subject: `Interested in ${product.title}`,
    body: `Hey Hello World Cards,\n\nI am interested in your ${product.title} currently listed on your website. Is it still available? If so I would like to buy it.\n\nKind regards,\n\n[Your name]`
  }
}

function composeMailto(href: string, pathname: string): string | undefined {
  const content = getMailContent(pathname)
  if (!content) {
    return undefined
  }

  const address = href.replace(/^mailto:/i, '').split('?')[0]
  return `mailto:${address}?subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(content.body)}`
}

export default function Mailing() {
  const { pathname } = useLocation()

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a[href^="mailto:"]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.closest('footer')) {
        return
      }

      const mailto = composeMailto(anchor.getAttribute('href') ?? '', pathname)
      if (!mailto) {
        return
      }

      event.preventDefault()
      window.location.href = mailto
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  return null
}
