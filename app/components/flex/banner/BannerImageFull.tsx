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
    <section id="banner-image-full" className="relative min-h-[70vh] overflow-hidden">
      {image && <img src={image} alt={title ?? ''} className="absolute inset-0 size-full object-cover" />}
      <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
      {(title || description || link) && (
        <div className="absolute inset-0">
          <div className="container-full flex h-full flex-col justify-end pb-12 sm:pb-16 lg:pb-20">
            <div className="flex max-w-4xl flex-col gap-4">
              {title && (
                <Animated delay={100}>
                  <h1 className="title-xl text-white">{title}</h1>
                </Animated>
              )}
              {description && (
                <Animated delay={200}>
                  <p className="content-xl text-white">{description}</p>
                </Animated>
              )}
              {link?.url && link?.title && (
                <Animated delay={300}>
                  <a href={link.url} target={link.target} className="button-deep-green">
                    {link.title}
                  </a>
                </Animated>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
