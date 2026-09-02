import { Link, useLocation } from 'react-router'
import { useCms } from '~/cms/context'
import Logo from '~/components/elements/Logo'
import { FormContactLinks } from '~/components/flex/form/FormContact'
import { SITE_NAME, isCurrentPath } from '~/seo/site'

const FALLBACK_MENU = [
  { title: 'Products', to: '/products/' },
  { title: 'Agenda', to: '/agenda/' },
  { title: 'About', to: '/about/' },
  { title: 'Contact', to: '/contact/' }
]

export default function Footer() {
  const location = useLocation()
  const cms = useCms()
  const menu = cms?.nav.footer.map((item) => ({ title: item.label, to: item.href })) ?? FALLBACK_MENU

  return (
    <footer className="max-lg:border-t border-site-mulled-wine max-lg:pt-8 pb-16 text-site-gray-nurse lg:pb-24">
      <div className="container-full">
        <div className="grid gap-14 lg:grid-cols-[minmax(180px,1fr)_auto] lg:items-start lg:gap-24 xl:gap-40">
          <Link to="/" className="block w-fit transition-opacity hover:opacity-80" aria-label={SITE_NAME}>
            <Logo className="h-auto w-40 sm:w-46 lg:w-54" />
          </Link>

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(150px,211px)_minmax(200px,320px)_auto] lg:gap-8 xl:gap-16">
            <nav aria-label="Footer menu" className="hidden lg:block">
              <h2 className="text-lg font-bold leading-7">Menu</h2>
              <ul className="mt-4 flex flex-col sm:gap-2 gap-6 text-base font-medium leading-7">
                {menu.map((item) => (
                  <li key={`${item.to}:${item.title}`} className="min-w-60">
                    <Link
                      to={item.to}
                      className="link-underline transition-colors hover:text-site-envy aria-[current=page]:text-site-envy"
                      aria-current={isCurrentPath(location.pathname, item.to) ? 'page' : undefined}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <FormContactLinks variant="split" />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-site-mulled-wine pt-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base font-medium leading-7">
            © {new Date().getFullYear()} {SITE_NAME}. All cards reserved.
          </p>
          <Link
            to="/privacy/"
            className="link-underline w-fit text-base font-medium leading-7 transition-colors hover:text-site-envy aria-[current=page]:text-site-envy"
            aria-current={isCurrentPath(location.pathname, '/privacy/') ? 'page' : undefined}
          >
            Privacy statement
          </Link>
        </div>
      </div>
    </footer>
  )
}
