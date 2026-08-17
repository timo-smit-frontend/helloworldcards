import { Animated } from '~/components/elements/Animated'
import type { FaqItem } from '~/database/faq'
import useLocationFinder from '~/hooks/useLocationFinder'
import { cn } from '~/services/utils'

export default function ContentFaq({ title = 'Questions people ask', items }: { title?: string; items: FaqItem[] }) {
  const { ref, isFirst } = useLocationFinder()

  if (!items.length) {
    return null
  }

  return (
    <section id="content-faq" ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div className="flex max-w-4xl flex-col gap-10 lg:gap-12">
          <Animated delay={100}>
            <h2 className="title-l">{title}</h2>
          </Animated>
          <div className="flex flex-col">
            {items.map((item, index) => {
              const headingId = `faq-${item.id}`

              return (
                <Animated key={item.id} delay={index < 3 ? 200 : 300}>
                  <section
                    className="flex flex-col gap-3 border-t border-site-mulled-wine py-8 first:border-t-0 first:pt-0 last:pb-0"
                    aria-labelledby={headingId}
                  >
                    <h3 id={headingId} className="title-xs">
                      {item.question}
                    </h3>
                    <p className="content-m text-site-mantle">{item.answer}</p>
                  </section>
                </Animated>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
