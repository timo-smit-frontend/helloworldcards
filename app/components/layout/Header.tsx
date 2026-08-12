import * as SheetPrimitive from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import Logo from '~/components/elements/Logo'
import { cn } from '~/services/utils'

const SITE_NAME = 'Hello World Cards'
const PRODUCTS_URL = '/products'
const PRODUCTS_TITLE = 'Products'
const CONTACT_URL = '/contact'
const CONTACT_TITLE = 'Contact us'

function ContactArrow() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden>
      <path
        d="M14 5.99012C13.9951 5.46407 13.7832 4.96113 13.41 4.59027L9.12 0.29076C8.93264 0.10453 8.67919 0 8.415 0C8.15081 0 7.89736 0.10453 7.71 0.29076C7.61627 0.383713 7.54188 0.494301 7.49111 0.616147C7.44034 0.737992 7.4142 0.868683 7.4142 1.00068C7.4142 1.13268 7.44034 1.26337 7.49111 1.38521C7.54188 1.50706 7.61627 1.61765 7.71 1.7106L11 4.99023H1C0.734784 4.99023 0.48043 5.09557 0.292893 5.28309C0.105357 5.4706 0 5.72493 0 5.99012C0 6.2553 0.105357 6.50963 0.292893 6.69714C0.48043 6.88466 0.734784 6.99 1 6.99H11L7.71 10.2796C7.5217 10.4666 7.41538 10.7207 7.41444 10.986C7.41351 11.2513 7.51802 11.5062 7.705 11.6945C7.89198 11.8828 8.1461 11.9891 8.41146 11.99C8.67683 11.9909 8.9317 11.8864 9.12 11.6995L13.41 7.39996C13.7856 7.02665 13.9978 6.51963 14 5.99012Z"
        fill="currentColor"
      />
    </svg>
  )
}

function MobileMenuSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Trigger
        className="relative inline-flex size-11 items-center justify-center text-neutral-900 xl:hidden"
        aria-label="Open menu"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12h16" />
          <path d="M4 18h16" />
          <path d="M4 6h16" />
        </svg>
      </SheetPrimitive.Trigger>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-site-deep-green/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <SheetPrimitive.Content className="fixed inset-x-0 top-0 z-50 flex h-full flex-col border-b border-neutral-200 bg-white p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top">
          <SheetPrimitive.Title className="sr-only">Menu</SheetPrimitive.Title>
          <div className="mx-auto flex w-full flex-col sm:w-9/12 max-sm:min-h-0 max-sm:flex-1">
            <div className="mb-10 flex shrink-0 items-center justify-between sm:mb-12">
              <Link to="/" className="shrink-0" onClick={() => onOpenChange(false)}>
                <span className="sr-only">{SITE_NAME}</span>
                <Logo className="h-20 w-auto" />
              </Link>
              <SheetPrimitive.Close className="inline-flex size-11 items-center justify-center rounded-sm text-neutral-900 opacity-70 transition-opacity focus:outline-hidden focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-site-gold sm:hover:opacity-100">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
                <span className="sr-only">Close</span>
              </SheetPrimitive.Close>
            </div>
            <div className="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:justify-between">
              <nav aria-label="Mobile">
                <Link
                  to={PRODUCTS_URL}
                  className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-xl sm:text-2xl lg:text-3xl"
                  onClick={() => onOpenChange(false)}
                >
                  {PRODUCTS_TITLE}
                </Link>
                <Link
                  to={CONTACT_URL}
                  className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-xl sm:text-2xl lg:text-3xl"
                  onClick={() => onOpenChange(false)}
                >
                  {CONTACT_TITLE}
                </Link>
              </nav>
              <Link
                to={CONTACT_URL}
                className="button-deep-green mt-8 flex h-14 w-full shrink-0 items-center justify-center gap-2.5 rounded-[92px] px-7 text-lg font-medium sm:w-fit"
                onClick={() => onOpenChange(false)}
              >
                {CONTACT_TITLE}
                <ContactArrow />
              </Link>
            </div>
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
    const onScroll = () => setIsSticky(window.scrollY > 10)

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'smooth sticky top-0 z-50 bg-white',
        !menuOpen && 'drop-shadow-[0px_1px_2.5px_rgba(0,0,0,0.15)]',
        isSticky && !menuOpen && 'shadow',
        menuOpen && 'z-60'
      )}
    >
      <div className="container-full">
        <div className="flex items-center justify-between py-2">
          <Link to="/" className="shrink-0">
            <span className="sr-only">{SITE_NAME}</span>
            <Logo className="h-20 w-auto" />
          </Link>

          <div className="flex items-center gap-3 xl:gap-12">
            <Link
              to={PRODUCTS_URL}
              className="title-base hidden text-lg font-medium transition-colors hover:text-site-deep-green xl:inline-flex"
            >
              {PRODUCTS_TITLE}
            </Link>
            <Link to={CONTACT_URL} className="button-malibu hidden items-center justify-center gap-2.5 xl:inline-flex">
              {CONTACT_TITLE}
              <ContactArrow />
            </Link>

            <MobileMenuSheet key={location.key} open={menuOpen} onOpenChange={setMenuOpen} />
          </div>
        </div>
      </div>
    </header>
  )
}
