import { Animated } from '~/components/elements/Animated'

export default function ContentText({
  title,
  description,
  link,
  heading = 'h2'
}: {
  title?: string
  description?: string
  link?: { url: string; title: string }
  heading?: 'h1' | 'h2'
}) {
  const Title = heading

  return (
    <section id="content-text" className="section">
      <div className="container-full">
        <div className="flex max-w-4xl flex-col gap-3 lg:gap-6">
          {title && (
            <Animated delay={100}>
              <Title className="title-l">{title}</Title>
            </Animated>
          )}
          {description && (
            <Animated delay={200}>
              <p className="content-l text-site-mantle">{description}</p>
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
