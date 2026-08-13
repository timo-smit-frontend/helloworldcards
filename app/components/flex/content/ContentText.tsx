import { Animated } from '~/components/elements/Animated'

export default function ContentText({
  title,
  description,
  link
}: {
  title?: string
  description?: string
  link?: { url: string; title: string }
}) {
  return (
    <section id="content-text" className="section">
      <div className="container-full">
        <div className="flex max-w-3xl flex-col gap-3 lg:gap-6">
          {title && (
            <Animated delay={100}>
              <h2 className="title-l">{title}</h2>
            </Animated>
          )}
          {description && (
            <Animated delay={200}>
              <p className="content-l text-muted">{description}</p>
            </Animated>
          )}
          {link && (
            <Animated delay={300}>
              <a href={link.url} className="button-leaf">
                {link.title}
              </a>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
