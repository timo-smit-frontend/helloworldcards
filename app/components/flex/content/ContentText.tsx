import { Animated } from '~/components/elements/Animated'

export default function ContentText({ title, description }: { title?: string; description?: string }) {
  return (
    <section id="content-text" className="section">
      <div className="container-full">
        <div className="flex flex-col gap-4 max-w-3xl mx-auto">
          {title && (
            <Animated delay={100}>
              <h2 className="title-l">{title}</h2>
            </Animated>
          )}
          {description && (
            <Animated delay={200}>
              <p className="content-l text-site-deep-green">{description}</p>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
