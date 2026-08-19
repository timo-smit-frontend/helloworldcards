import * as SheetPrimitive from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import BurgerMenu from '~/components/elements/BurgerMenu'
import Logo from '~/components/elements/Logo'
import { SITE_NAME } from '~/seo/site'
import { cn } from '~/services/utils'

const PRODUCTS_URL = '/products'
const PRODUCTS_TITLE = 'Products'
const AGENDA_URL = '/agenda'
const AGENDA_TITLE = 'Agenda'
const ABOUT_URL = '/about'
const ABOUT_TITLE = 'About'
const CONTACT_URL = '/contact'
const CONTACT_TITLE = 'Contact us'
const navLinkClass = 'text-lg font-semibold transition-colors hover:text-site-summer-green'

function MobileMenuSheet({ open, onOpenChange, pathname }: { open: boolean; onOpenChange: (open: boolean) => void; pathname: string }) {
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
              <Link to="/" className="shrink-0" onClick={() => onOpenChange(false)}>
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
              <Link
                to={PRODUCTS_URL}
                className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl"
                aria-current={pathname === PRODUCTS_URL ? 'page' : undefined}
                onClick={() => onOpenChange(false)}
              >
                {PRODUCTS_TITLE}
              </Link>
              <Link
                to={AGENDA_URL}
                className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl"
                aria-current={pathname === AGENDA_URL ? 'page' : undefined}
                onClick={() => onOpenChange(false)}
              >
                {AGENDA_TITLE}
              </Link>
              <Link
                to={ABOUT_URL}
                className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl"
                aria-current={pathname === ABOUT_URL ? 'page' : undefined}
                onClick={() => onOpenChange(false)}
              >
                {ABOUT_TITLE}
              </Link>
              <Link
                to={CONTACT_URL}
                className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl"
                aria-current={pathname === CONTACT_URL ? 'page' : undefined}
                onClick={() => onOpenChange(false)}
              >
                {CONTACT_TITLE}
              </Link>
            </nav>
          </div>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  )
}

export default function Header() {
  const location = useLocation()
  const [isSticky, setIsSticky] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
          <Link to="/" className="shrink-0">
            <span className="sr-only">{SITE_NAME}</span>
            <Logo className="h-20 w-auto" />
          </Link>

          <div className="flex items-center gap-3 lg:gap-12">
            <nav aria-label="Primary" className="hidden items-center gap-12 lg:flex">
              <Link to={PRODUCTS_URL} className={navLinkClass} aria-current={location.pathname === PRODUCTS_URL ? 'page' : undefined}>
                {PRODUCTS_TITLE}
              </Link>
              <Link to={AGENDA_URL} className={navLinkClass} aria-current={location.pathname === AGENDA_URL ? 'page' : undefined}>
                {AGENDA_TITLE}
              </Link>
              <Link to={ABOUT_URL} className={navLinkClass} aria-current={location.pathname === ABOUT_URL ? 'page' : undefined}>
                {ABOUT_TITLE}
              </Link>
              <Link to={CONTACT_URL} className={navLinkClass} aria-current={location.pathname === CONTACT_URL ? 'page' : undefined}>
                Contact
              </Link>
            </nav>

            <MobileMenuSheet open={menuOpen} onOpenChange={setMenuOpen} pathname={location.pathname} />
          </div>
        </div>
      </div>
    </header>
  )
}
