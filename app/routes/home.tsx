import { Animated } from '~/components/elements/Animated'

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <section className="text-center">
        <Animated>
          <h1 className="text-4xl font-bold">Hello World Cards</h1>
        </Animated>
        <Animated>
          <p className="text-2xl text-site-deep-green">Currently in development</p>
        </Animated>
      </section>
    </div>
  )
}
