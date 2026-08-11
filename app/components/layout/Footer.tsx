import { Link } from 'react-router'
import Logo from '~/components/elements/Logo'

const FOOTER_MENU = [{ title: 'Contact', to: '/contact' }]

const DISCLAIMER_MENU = [
  { title: 'Privacy', to: '#' },
  { title: 'Algemene voorwaarden', to: '#' }
]

export default function Footer() {
  return (
    <footer data-component="Footer" className="section-top pb-16 text-black lg:pb-20">
      <div className="container-full">
        <div className="grid gap-14 lg:grid-cols-[minmax(180px,1fr)_auto] lg:items-start lg:gap-24 xl:gap-40">
          <Link to="/" className="block w-fit" aria-label="Hello World Cards">
            <Logo className="h-auto w-40 sm:w-46 lg:w-54" />
          </Link>

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(150px,211px)_minmax(200px,320px)_auto] lg:gap-8 xl:gap-16">
            <nav aria-label="Footer menu" className="hidden lg:block">
              <h2 className="font-site-cleanvertising text-lg font-bold leading-7">Menu</h2>
              <ul className="mt-4 flex flex-col gap-2 text-base font-medium leading-7">
                {FOOTER_MENU.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className="transition-colors hover:text-site-deep-green hover:underline">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div>
              <h2 className="font-site-cleanvertising text-lg font-bold leading-7">Contact</h2>
              <ul className="mt-4 flex flex-col gap-2 text-base font-medium leading-7">
                <li>
                  <a href="mailto:helloworldcards@outlook.com" className="transition-colors hover:text-site-deep-green hover:underline">
                    helloworldcards@outlook.com
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="font-site-cleanvertising text-lg font-bold leading-7">Volg ons</h2>
              <ul className="mt-4 flex flex-col gap-2 text-base font-medium leading-7">
                <li>
                  <a
                    href="https://www.instagram.com/helloworldcards/"
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-fit items-center gap-2 transition-colors hover:text-site-deep-green hover:underline"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden" aria-hidden>
                      <svg viewBox="0 0 24 24" className="size-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                      </svg>
                    </span>
                    <span>Instagram</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-site-deep-green pt-10">
          <div className="flex flex-col gap-6 text-base font-medium leading-7 lg:flex-row lg:items-start lg:justify-between">
            <p>© {new Date().getFullYear()} Hello World Cards. All rights reserved.</p>
            <nav aria-label="Disclaimer menu">
              <ul className="flex flex-col gap-x-6 gap-y-2 sm:flex-row sm:flex-wrap lg:justify-end">
                {DISCLAIMER_MENU.map((item) => (
                  <li key={item.title}>
                    <Link to={item.to} className="transition-colors hover:text-site-deep-green hover:underline">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
