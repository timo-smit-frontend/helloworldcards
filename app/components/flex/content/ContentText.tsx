import { Animated } from '~/components/elements/Animated'
import Image from '~/components/elements/Image'

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
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-4 lg:gap-8">
            {(title || description) && (
              <div className="flex flex-col gap-2 lg:gap-4">
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
              </div>
            )}
            {link && (
              <Animated delay={300}>
                <a href={link.url} className="button-green">
                  {link.title}
                </a>
              </Animated>
            )}
          </div>
          <Animated delay={400}>
            <div className="relative overflow-hidden lg:h-full">
              <Image
                src="https://www.serebii.net/scarletviolet/pokemon/new/194-f.png"
                alt="Pokémon card back"
                width={1280}
                height={960}
                maxwidth={1000}
                className="h-auto w-full lg:absolute lg:inset-0 lg:h-full lg:w-full object-contain max-h-100"
              />
            </div>
          </Animated>
        </div>
      </div>
    </section>
  )
}
