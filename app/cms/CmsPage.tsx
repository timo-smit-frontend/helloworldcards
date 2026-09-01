import { Link } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import Pokemon from '~/components/elements/Pokemon'
import Layout from '~/components/layout/Layout'
import { CmsBlocks } from './CmsBlocks'
import { useCms, useCmsLoading } from './context'

export default function CmsPage() {
  const cms = useCms()
  const loading = useCmsLoading()

  if (loading) {
    return (
      <Layout>
        <section className="section">
          <div className="container-full">
            <p className="content-l text-site-mantle">Loading…</p>
          </div>
        </section>
      </Layout>
    )
  }

  if (!cms || cms.notFound || !cms.page) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center py-16 sm:py-24 lg:py-32" aria-labelledby="error-title">
        <div className="container-full">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <Animated delay={100}>
              <div>
                <Pokemon />
              </div>
            </Animated>
            <Animated delay={200}>
              <p className="title-xl text-site-envy">404</p>
            </Animated>
            <Animated delay={300}>
              <h1 id="error-title" className="title-l">
                {cms?.settings.notFoundTitle ?? 'Page not found'}
              </h1>
            </Animated>
            <Animated delay={400}>
              <p className="content-l text-site-mantle">{cms?.settings.notFoundDescription ?? 'This page does not exist.'}</p>
            </Animated>
            <Animated delay={500}>
              <Link to="/" className="button-green mt-2">
                {cms?.settings.notFoundCta ?? 'Back to home'}
              </Link>
            </Animated>
          </div>
        </div>
      </main>
    )
  }

  return (
    <Layout>
      <CmsBlocks blocks={cms.page.blocks} />
    </Layout>
  )
}
