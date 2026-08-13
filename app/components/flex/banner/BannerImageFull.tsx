import { Animated } from '~/components/elements/Animated'

export default function BannerImageFull({
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
    <section id="banner-image-full" className="lg:border-b border-line bg-paper">
      <div className="container-full pt-12 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="flex flex-col gap-3 lg:gap-6">
            {title && (
              <Animated delay={200}>
                <h1 className="title-xl text-balance">{title}</h1>
              </Animated>
            )}
            {description && (
              <Animated delay={300}>
                <p className="content-l max-w-xl text-muted">{description}</p>
              </Animated>
            )}
            {link?.url && link?.title && (
              <Animated delay={400}>
                <div>
                  <a href={link.url} className="button-leaf">
                    {link.title}
                  </a>
                </div>
              </Animated>
            )}
          </div>
          {image && (
            <Animated delay={500}>
              <figure className="mat">
                <img src={image} alt={title ?? ''} className="aspect-3/2 w-full rounded-[0.9rem] object-cover" />
                <figcaption className="mt-3 px-1 text-sm text-muted">Cards and art, from our corner of the hobby</figcaption>
              </figure>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
