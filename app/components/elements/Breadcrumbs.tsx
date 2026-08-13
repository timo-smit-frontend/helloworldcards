import { Link } from 'react-router'
import { cn } from '~/services/utils'

export type BreadcrumbItem = {
  title: string
  url?: string
}

export default function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) {
    return null
  }

  return (
    <nav aria-label="Breadcrumb">
      <ol className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-site-deep-green', className)}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1

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
                <Link to={item.url} className="smooth hover:underline">
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
