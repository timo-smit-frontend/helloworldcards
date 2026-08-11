import { ReactNode } from 'react'
import Footer from '~/components/layout/Footer'
import Header from '~/components/layout/Header'

type LayoutProps = {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex flex-col">
      <Header />
      <main id="main" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  )
}
