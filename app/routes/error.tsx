import { Link } from 'react-router'
import { Animated } from '~/components/elements/Animated'

type ErrorPageProps = {
  code?: string
  title?: string
  description?: string
  link?: { url: string; title: string }
}

export default function ErrorPage({
  code = '404',
  title = 'Page not found',
  description = 'This page does not exist or has been moved.',
  link = { url: '/', title: 'Back to home' }
}: ErrorPageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center py-16 sm:py-24 lg:py-32" aria-labelledby="error-title">
      <div className="container-full">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <Animated delay={100}>
            <p className="title-xl text-leaf">{code}</p>
          </Animated>
          <Animated delay={200}>
            <h1 id="error-title" className="title-l">
              {title}
            </h1>
          </Animated>
          <Animated delay={300}>
            <p className="content-l text-muted">{description}</p>
          </Animated>
          <Animated delay={400}>
            <Link to={link.url} className="button-leaf mt-2">
              {link.title}
            </Link>
          </Animated>
        </div>
      </div>
    </main>
  )
}
