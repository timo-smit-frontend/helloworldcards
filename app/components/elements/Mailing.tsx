import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useCms } from '~/cms/context'

function getMailContent(pathname: string, productTitle?: string): { subject: string; body: string } | undefined {
  const productMatch = pathname.match(/^\/products\/([^/]+)\/?$/)
  if (!productMatch || !productTitle) {
    return undefined
  }

  return {
    subject: `Interested in ${productTitle}`,
    body: `Hey Hello World Cards,\n\nI am interested in your ${productTitle} currently listed on your website. Is it still available? If so I would like to buy it.\n\nKind regards,\n\n[Your name]`
  }
}

function composeMailto(href: string, pathname: string, productTitle?: string): string | undefined {
  const content = getMailContent(pathname, productTitle)
  if (!content) {
    return undefined
  }

  const address = href.replace(/^mailto:/i, '').split('?')[0]
  return `mailto:${address}?subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(content.body)}`
}

export default function Mailing() {
  const { pathname } = useLocation()
  const productTitle = useCms()?.product?.title

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

      const mailto = composeMailto(anchor.getAttribute('href') ?? '', pathname, productTitle)
      if (!mailto) {
        return
      }

      event.preventDefault()
      window.location.href = mailto
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname, productTitle])

  return null
}
