import { Animated } from '~/components/elements/Animated'
import ContactForm from '~/components/elements/ContactForm'
import { CONTACT_EMAIL, INSTAGRAM_URL } from '~/services/contact'

export default function ContentContact({ title, description }: { title?: string; description?: string }) {
  return (
    <section id="content-contact" className="section">
      <div className="container-full">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-24">
          <div className="flex flex-col gap-12">
            {(title || description) && (
              <div className="flex max-w-xl flex-col gap-3 lg:gap-6">
                {title && (
                  <Animated delay={100}>
                    <h1 className="title-l">{title}</h1>
                  </Animated>
                )}
                {description && (
                  <Animated delay={200}>
                    <p className="content-l text-muted">{description}</p>
                  </Animated>
                )}
              </div>
            )}

            <Animated delay={300}>
              <div>
                <h2 className="font-display text-lg font-bold leading-7">Contact</h2>
                <ul className="mt-4 flex flex-col gap-2 text-base font-medium leading-7">
                  <li>
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="flex w-fit items-center gap-2 transition-colors hover:text-leaf hover:underline"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 shrink-0"
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
                      <span>{CONTACT_EMAIL}</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href={INSTAGRAM_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-fit items-center gap-2 transition-colors hover:text-leaf hover:underline"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                      </svg>
                      <span>Instagram</span>
                    </a>
                  </li>
                </ul>
              </div>
            </Animated>
          </div>

          <Animated delay={400}>
            <div>
              <ContactForm />
            </div>
          </Animated>
        </div>
      </div>
    </section>
  )
}
