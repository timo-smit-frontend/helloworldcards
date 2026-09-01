import * as SheetPrimitive from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useCms } from '~/cms/context'
import BurgerMenu from '~/components/elements/BurgerMenu'
import Logo from '~/components/elements/Logo'
import { SITE_NAME, isCurrentPath } from '~/seo/site'
import { cn } from '~/services/utils'

const FALLBACK_NAV = [
  { href: '/products/', label: 'Products' },
  { href: '/agenda/', label: 'Agenda' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' }
]
const navLinkClass =
  'link-underline text-lg font-semibold transition-colors hover:text-site-summer-green aria-[current=page]:text-site-summer-green'
const mobileNavLinkClass = 'mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl'

function MobileNavLink({ to, pathname, onNavigate, children }: { to: string; pathname: string; onNavigate: () => void; children: string }) {
  const current = isCurrentPath(pathname, to)

  return (
    <Link
      to={to}
      className={cn(mobileNavLinkClass, current && 'text-site-envy')}
      aria-current={current ? 'page' : undefined}
      onClick={onNavigate}
    >
      {children}
    </Link>
  )
}

function MobileMenuSheet({
  open,
  onOpenChange,
  pathname,
  items
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathname: string
  items: Array<{ href: string; label: string }>
}) {
  const [iconOpen, setIconOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setIconOpen(false)
      return
    }

    const frame = requestAnimationFrame(() => setIconOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Trigger
        className="relative z-10 inline-flex size-11 items-center justify-center text-site-gray-nurse lg:hidden"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        <BurgerMenu className="cursor-pointer" open={false} />
      </SheetPrimitive.Trigger>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-site-dark/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-200 data-[state=open]:duration-300" />
        <SheetPrimitive.Content
          aria-modal="true"
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-0 z-50 flex h-full flex-col bg-site-gunmetal text-site-gray-nurse shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-200 data-[state=open]:duration-300"
        >
          <SheetPrimitive.Title className="sr-only">Menu</SheetPrimitive.Title>
          <SheetPrimitive.Description className="sr-only">Site navigation</SheetPrimitive.Description>
          <div className="container-full">
            <div className="flex items-center justify-between py-2">
              <Link to="/" className="shrink-0 transition-opacity hover:opacity-80" onClick={() => onOpenChange(false)}>
                <span className="sr-only">{SITE_NAME}</span>
                <Logo className="h-20 w-auto" />
              </Link>
              <SheetPrimitive.Close
                className="inline-flex size-11 items-center justify-center text-site-gray-nurse"
                aria-label="Close menu"
              >
                <BurgerMenu className="cursor-pointer" open={iconOpen} />
              </SheetPrimitive.Close>
            </div>
            <nav aria-label="Primary" className="flex flex-col gap-6 py-10 sm:gap-8">
              {items.map((item) => (
                <MobileNavLink key={item.href} to={item.href} pathname={pathname} onNavigate={() => onOpenChange(false)}>
                  {item.label}
                </MobileNavLink>
              ))}
            </nav>
          </div>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  )
}

export default function Header() {
  const location = useLocation()
  const cms = useCms()
  const [isSticky, setIsSticky] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const items = cms?.nav.header.map((item) => ({ href: item.href, label: item.label })) ?? FALLBACK_NAV

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onScroll = () => setIsSticky(window.scrollY > 10)

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'smooth sticky top-0 z-50 border-b border-site-mulled-wine bg-site-dark/90 text-site-gray-nurse backdrop-blur-md',
        isSticky && !menuOpen && 'shadow-sm'
      )}
      aria-hidden={menuOpen ? true : undefined}
    >
      <div className="container-full">
        <div className="flex items-center justify-between py-2">
          <Link to="/" className="shrink-0 transition-opacity hover:opacity-80">
            <span className="sr-only">{SITE_NAME}</span>
            <Logo className="h-20 w-auto" />
          </Link>

          <div className="flex items-center gap-3 lg:gap-12">
            <nav aria-label="Primary" className="hidden items-center gap-12 lg:flex">
              {items.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={navLinkClass}
                  aria-current={isCurrentPath(location.pathname, item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <MobileMenuSheet open={menuOpen} onOpenChange={setMenuOpen} pathname={location.pathname} items={items} />
          </div>
        </div>
      </div>
    </header>
  )
}
