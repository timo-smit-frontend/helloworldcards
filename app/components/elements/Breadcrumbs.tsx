import { Link, useLocation } from 'react-router'
import { useCms } from '~/cms/context'
import { cn } from '~/services/utils'

export type BreadcrumbItem = {
  title: string
  url?: string
}

function crumbsFromPath(pathname: string, pageTitle?: string, productTitle?: string): BreadcrumbItem[] {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return []

  const crumbs: BreadcrumbItem[] = [{ title: 'Home', url: '/' }]
  const segments = path.split('/').filter(Boolean)

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    const url = `/${segments.slice(0, index + 1).join('/')}/`
    let title: string | undefined

    if (segment === 'products' && index === 0) {
      title = 'Products'
    } else if (segments[0] === 'products' && index === 1) {
      title = productTitle ?? decodeURIComponent(segment)
    } else if (isLast) {
      title = pageTitle ?? segment.replace(/-/g, ' ')
    } else {
      title = segment.replace(/-/g, ' ')
    }

    crumbs.push(isLast ? { title } : { title, url })
  })

  return crumbs
}

export default function Breadcrumbs({ items, className }: { items?: BreadcrumbItem[]; className?: string }) {
  const { pathname } = useLocation()
  const cms = useCms()
  const crumbs = items ?? crumbsFromPath(pathname, cms?.page?.title, cms?.product?.title)

  if (crumbs.length === 0) {
    return null
  }

  return (
    <nav aria-label="Breadcrumb">
      <ol className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-site-mantle', className)}>
        {crumbs.map((item, index) => {
          const isLast = index === crumbs.length - 1

          return (
            <li key={`${item.title}-${index}`} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden className="opacity-50">
                  /
                </span>
              )}
              {isLast || !item.url ? (
                <span aria-current={isLast ? 'page' : undefined} className={cn(isLast && 'font-medium')}>
                  {item.title}
                </span>
              ) : (
                <Link to={item.url} className="link-underline">
                  {item.title}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
