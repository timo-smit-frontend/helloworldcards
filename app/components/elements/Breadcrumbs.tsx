import { Link, useLocation } from 'react-router'
import { getProductBySlug } from '~/database/products'
import { cn } from '~/services/utils'

export type BreadcrumbItem = {
  title: string
  url?: string
}

const PAGE_TITLES: Record<string, string> = {
  products: 'Products',
  agenda: 'Agenda',
  about: 'About',
  contact: 'Contact',
  privacy: 'Privacy statement'
}

function crumbsFromPath(pathname: string): BreadcrumbItem[] {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return []

  const crumbs: BreadcrumbItem[] = [{ title: 'Home', url: '/' }]
  const segments = path.split('/').filter(Boolean)

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    const url = `/${segments.slice(0, index + 1).join('/')}/`
    let title = PAGE_TITLES[segment]

    if (!title && segments[0] === 'products' && index === 1) {
      title = getProductBySlug(segment)?.title ?? decodeURIComponent(segment)
    }

    crumbs.push(isLast ? { title: title ?? segment } : { title: title ?? segment.replace(/-/g, ' '), url })
  })

  return crumbs
}

export default function Breadcrumbs({ items, className }: { items?: BreadcrumbItem[]; className?: string }) {
  const { pathname } = useLocation()
  const crumbs = items ?? crumbsFromPath(pathname)

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
