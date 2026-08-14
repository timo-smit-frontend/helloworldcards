import { Link } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import Pokemon from '~/components/elements/Pokemon'

export default function ErrorPage() {
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
            <p className="title-xl text-site-ginger-brown">404</p>
          </Animated>
          <Animated delay={300}>
            <h1 id="error-title" className="title-l">
              Page not found
            </h1>
          </Animated>
          <Animated delay={400}>
            <p className="content-l text-site-lemon-grass">This page does not exist or has been moved.</p>
          </Animated>
          <Animated delay={500}>
            <Link to="/" className="button-leaf mt-2">
              Back to home
            </Link>
          </Animated>
        </div>
      </div>
    </main>
  )
}
