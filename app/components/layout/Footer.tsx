import { Link, useLocation } from 'react-router'
import Logo from '~/components/elements/Logo'
import { CONTACT_EMAIL, INSTAGRAM_URL } from '~/services/contact'

const FOOTER_MENU = [
  { title: 'Products', to: '/products' },
  { title: 'Agenda', to: '/agenda' },
  { title: 'About', to: '/about' },
  { title: 'Contact', to: '/contact' }
]

export default function Footer() {
  const location = useLocation()

  return (
    <footer className="max-lg:border-t border-site-mulled-wine max-lg:pt-8 pb-16 text-site-pearl-bush lg:pb-24">
      <div className="container-full">
        <div className="grid gap-14 lg:grid-cols-[minmax(180px,1fr)_auto] lg:items-start lg:gap-24 xl:gap-40">
          <Link to="/" className="block w-fit" aria-label="Hello World Cards">
            <Logo className="h-auto w-40 sm:w-46 lg:w-54" />
          </Link>

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(150px,211px)_minmax(200px,320px)_auto] lg:gap-8 xl:gap-16">
            <nav aria-label="Footer menu" className="hidden lg:block">
              <h2 className="text-lg font-bold leading-7">Menu</h2>
              <ul className="mt-4 flex flex-col gap-2 text-base font-medium leading-7">
                {FOOTER_MENU.map((item) => (
                  <li key={item.to} className="min-w-60">
                    <Link
                      to={item.to}
                      className="transition-colors hover:text-site-ginger-brown hover:underline"
                      aria-current={location.pathname === item.to ? 'page' : undefined}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="min-w-60">
              <h2 className="text-lg font-bold leading-7">Contact</h2>
              <ul className="mt-4 flex flex-col gap-2 text-base font-medium leading-7">
                <li>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="flex w-fit items-center gap-2 transition-colors hover:text-site-ginger-brown hover:underline"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <span>{CONTACT_EMAIL}</span>
                  </a>
                </li>
              </ul>
            </div>

            <div className="min-w-60">
              <h2 className="text-lg font-bold leading-7">Follow us</h2>
              <ul className="mt-4 flex flex-col gap-2 text-base font-medium leading-7">
                <li>
                  <a
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex w-fit items-center gap-2 transition-colors hover:text-site-ginger-brown hover:underline"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                    </svg>
                    <span>Instagram</span>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-site-mulled-wine pt-10">
          <p className="text-base font-medium leading-7">© {new Date().getFullYear()} Hello World Cards. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
