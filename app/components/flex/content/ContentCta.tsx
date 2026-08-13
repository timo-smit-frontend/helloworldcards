import { Animated } from '~/components/elements/Animated'
import { cn } from '~/services/utils'

export default function ContentCta({
  title,
  description,
  image,
  link
}: {
  title?: string
  description?: string
  image?: string
  link?: { url?: string; target?: string; title?: string }
}) {
  return (
    <section id="content-cta" className="section">
      <div className="container-full">
        <div className="grid items-center overflow-hidden rounded-panel bg-cream shadow-card ring-1 ring-line sm:grid-cols-2">
          {(title || description || link) && (
            <div className={cn('flex flex-col gap-5 px-6 py-10 sm:px-8 lg:px-12 lg:py-16', !image && 'items-center text-center')}>
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
              {link?.url && link?.title && (
                <Animated delay={300}>
                  <a href={link.url} className="button-leaf gap-2.5">
                    {link.title}
                  </a>
                </Animated>
              )}
            </div>
          )}
          {image && (
            <Animated delay={400}>
              <img src={image} alt="" className="aspect-7/6 h-full w-full object-cover" />
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
