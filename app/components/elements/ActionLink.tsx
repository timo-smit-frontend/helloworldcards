import { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '~/services/utils'

export default function ActionLink({ url, className, children }: { url: string; className?: string; children: ReactNode }) {
  const isExternal = /^(mailto:|https?:|tel:)/i.test(url)

  if (isExternal) {
    return (
      <a href={url} className={cn(className)}>
        {children}
      </a>
    )
  }

  return (
    <Link to={url} className={cn(className)}>
      {children}
    </Link>
  )
}
