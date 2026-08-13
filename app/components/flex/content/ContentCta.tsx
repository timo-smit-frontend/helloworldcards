import { Animated } from '~/components/elements/Animated'
import { cn } from '~/services/utils'

function MailIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

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
  const isMailto = Boolean(link?.url?.startsWith('mailto:'))

  return (
    <section id="content-cta" className="section-bg bg-site-deep-green text-white">
      <div className="container-full">
        <div className="grid items-center gap-8 lg:gap-24 grid-cols-1 sm:grid-cols-2">
          {(title || description || link) && (
            <div className={cn('flex flex-col gap-5', !image && 'items-center text-center')}>
              {title && (
                <Animated delay={100}>
                  <h2 className="title-l text-white">{title}</h2>
                </Animated>
              )}
              {description && (
                <Animated delay={200}>
                  <p className="content-l text-white/90">{description}</p>
                </Animated>
              )}
              {link?.url && link?.title && (
                <Animated delay={300}>
                  <a href={link.url} target={isMailto ? undefined : link.target} className="button-malibu gap-2.5">
                    {isMailto && <MailIcon />}
                    {link.title}
                  </a>
                </Animated>
              )}
            </div>
          )}
          {image && (
            <Animated delay={400}>
              <img src={image} alt="" className="aspect-7/6 h-auto w-full object-cover" />
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
