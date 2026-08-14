import { Animated } from '~/components/elements/Animated'
import Image from '~/components/elements/Image'
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
  link?: { url?: string; title?: string }
}) {
  return (
    <section id="content-cta" className="section">
      <div className="container-full">
        <div className="grid items-center overflow-hidden rounded-panel bg-site-gunmetal shadow-card ring-1 ring-site-mulled-wine sm:grid-cols-2">
          {(title || description || link) && (
            <div className={cn('flex flex-col gap-3 px-6 py-10 sm:px-8 lg:gap-6 lg:px-12 lg:py-16', !image && 'items-center text-center')}>
              {title && (
                <Animated delay={100}>
                  <h2 className="title-l">{title}</h2>
                </Animated>
              )}
              {description && (
                <Animated delay={200}>
                  <p className="content-l text-site-lemon-grass">{description}</p>
                </Animated>
              )}
              {link?.url && link?.title && (
                <Animated delay={300}>
                  <div>
                    <a href={link.url} className="button-leaf gap-2.5">
                      {link.title}
                    </a>
                  </div>
                </Animated>
              )}
            </div>
          )}
          {image && (
            <Animated delay={400}>
              <Image src={image} alt="" width={1280} height={960} className="sm:aspect-7/6 aspect-3/2 h-full w-full object-cover" />
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
