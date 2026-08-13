import { ReactNode } from 'react'
import Mailing from '~/components/elements/Mailing'
import Footer from '~/components/layout/Footer'
import Header from '~/components/layout/Header'
import { cn } from '~/services/utils'

type LayoutProps = {
  children: ReactNode
  className?: string
}

export default function Layout({ children, className }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Mailing />
      <Header />
      <main id="main" className={cn('flex flex-1 flex-col', className)} tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  )
}
