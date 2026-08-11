import { Animated } from '~/components/elements/Animated'

export default function BannerImage({
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
    <section id="banner-image" className="py-16">
      <div className="container-full">
        <div className="grid grid-cols-2 gap-16 items-center">
          {(title || description || link) && (
            <Animated delay={100}>
              <div className="flex flex-col gap-4">
                {title && <h1 className="title-xl">{title}</h1>}
                {description && (
                  <Animated delay={200}>
                    <p className="content-xl text-site-deep-green">{description}</p>
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
            </Animated>
          )}
          {image && (
            <div>
              <Animated delay={400}>
                <img src={image} alt="Banner" className="w-full h-auto aspect-7/6 object-cover" />
              </Animated>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
