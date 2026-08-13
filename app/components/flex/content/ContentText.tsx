import { Animated } from '~/components/elements/Animated'

export default function ContentText({
  title,
  description,
  link
}: {
  title?: string
  description?: string
  link?: { url: string; title: string; target?: string }
}) {
  return (
    <section id="content-text" className="section">
      <div className="container-full">
        <div className="flex flex-col sm:items-center gap-4 max-w-4xl mx-auto sm:text-center">
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
          {link && (
            <Animated delay={300}>
              <a href={link.url} target={link.target} className="button-deep-green">
                {link.title}
              </a>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
