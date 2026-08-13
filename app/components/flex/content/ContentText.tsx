import { Animated } from '~/components/elements/Animated'
import ActionLink from '~/components/elements/ActionLink'

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
        <div className="max-w-3xl">
          {title && (
            <Animated delay={100}>
              <h2 className="title-l">{title}</h2>
            </Animated>
          )}
          {description && (
            <Animated delay={200}>
              <p className="content-l mt-6 text-muted">{description}</p>
            </Animated>
          )}
          {link && (
            <Animated delay={300}>
              <ActionLink url={link.url} className="button-leaf mt-6">
                {link.title}
              </ActionLink>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
