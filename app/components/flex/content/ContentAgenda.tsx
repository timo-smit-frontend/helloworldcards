import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import { getEventsByIds, getUpcomingEvents } from '~/database/events'
import useLocationFinder from '~/hooks/useLocationFinder'
import { cn } from '~/services/utils'

const eventDelays = [100, 200, 300, 400, 500, 600] as const

function normalizeIds(id?: string | number | Array<string | number>): Array<string | number> | undefined {
  if (id == null) return undefined
  return Array.isArray(id) ? id : [id]
}

function formatEventDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)

  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

export default function ContentAgenda({
  title,
  description,
  id
}: {
  title?: string
  description?: string
  id?: string | number | Array<string | number>
}) {
  const { ref, isFirst } = useLocationFinder()
  const ids = normalizeIds(id)
  const events = ids ? getEventsByIds(ids) : getUpcomingEvents()

  return (
    <section id="content-agenda" ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div className="flex flex-col gap-10">
          {(title || description) && (
            <div className="flex max-w-3xl flex-col gap-8">
              {isFirst && <Breadcrumbs />}
              {(title || description) && (
                <div className="flex flex-col gap-2 lg:gap-4">
                  {title && (
                    <Animated delay={100}>
                      <h2 className="title-l">{title}</h2>
                    </Animated>
                  )}
                  {description && (
                    <Animated delay={200}>
                      <p className="content-l text-site-mantle">{description}</p>
                    </Animated>
                  )}
                </div>
              )}
            </div>
          )}

          {events.length > 0 ? (
            <ul className="m-0 list-none divide-y divide-site-mulled-wine overflow-hidden rounded-panel border border-site-mulled-wine bg-site-gunmetal p-0 px-5 sm:px-8">
              {events.map((event, index) => (
                <li key={event.id}>
                  <Animated delay={eventDelays[index % eventDelays.length]}>
                    <article className="grid gap-1 py-6 sm:grid-cols-[10rem_1fr_1fr] sm:items-baseline sm:gap-8">
                      <time dateTime={event.date} className="title-xs text-site-summer-green">
                        {formatEventDate(event.date)}
                      </time>
                      <h3 className="title-xs">{event.title}</h3>
                      <p className="content-m text-site-mantle sm:text-right">{event.location}</p>
                    </article>
                  </Animated>
                </li>
              ))}
            </ul>
          ) : (
            <Animated delay={200}>
              <p className="content-l text-site-mantle">No upcoming events right now. Check back soon.</p>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
