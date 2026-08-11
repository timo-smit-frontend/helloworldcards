import { Link } from 'react-router'
import Logo from '~/components/elements/Logo'

const FOOTER_MENU = [
  { title: 'Home', to: '/' },
  { title: 'Contact', to: '/contact' }
]

const DISCLAIMER_MENU = [
  { title: 'Privacy', to: '#' },
  { title: 'Algemene voorwaarden', to: '#' }
]

const SOCIALS = [{ title: 'LinkedIn', to: 'https://www.linkedin.com/', external: true }]

export default function Footer() {
  return (
    <footer data-component="Footer" className="section-top pb-16 text-black lg:pb-20">
      <div className="container-full">
        <div className="grid gap-14 lg:grid-cols-[minmax(180px,1fr)_auto] lg:items-start lg:gap-24 xl:gap-40">
          <Link to="/" className="block w-fit" aria-label="Hello World Cards">
            <Logo variant="slogan" className="h-auto w-40 sm:w-46 lg:w-54" />
          </Link>

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(200px,320px)_minmax(150px,211px)_auto] lg:gap-8 xl:gap-16">
            <div>
              <h2 className="title-base text-lg font-bold">Contact</h2>
              <div className="content-m mt-4 flex flex-col gap-8 text-black">
                <a
                  href="https://maps.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="smooth w-fit text-black no-underline hover:text-site-deep-green hover:underline"
                >
                  Voorbeeldstraat 1
                  <br />
                  1234 AB Amsterdam
                </a>
                <div>
                  <p>
                    E-mail:{' '}
                    <a
                      href="mailto:hello@helloworldcards.nl"
                      className="smooth text-black no-underline hover:text-site-deep-green hover:underline"
                    >
                      hello@helloworldcards.nl
                    </a>
                  </p>
                  <p>
                    Tel:{' '}
                    <a href="tel:+31201234567" className="smooth text-black no-underline hover:text-site-deep-green hover:underline">
                      +31 20 123 4567
                    </a>
                  </p>
                </div>
              </div>
            </div>

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

            <div className="sm:col-span-2 lg:col-span-1">
              <h2 className="font-site-cleanvertising text-lg font-bold leading-7">Volg ons</h2>
              <ul className="mt-4 flex flex-col gap-2 text-base font-medium leading-7">
                {SOCIALS.map((social) => (
                  <li key={social.title}>
                    <a
                      href={social.to}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-fit items-center gap-2 transition-colors hover:text-site-deep-green hover:underline"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden" aria-hidden>
                        <svg viewBox="0 0 24 24" className="size-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                      </span>
                      <span>{social.title}</span>
                    </a>
                  </li>
                ))}
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
