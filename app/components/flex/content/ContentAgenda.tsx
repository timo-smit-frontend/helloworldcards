import { Animated } from '~/components/elements/Animated'
import { getEventsByIds, getUpcomingEvents } from '~/database/events'

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
  const ids = normalizeIds(id)
  const events = ids ? getEventsByIds(ids) : getUpcomingEvents()

  return (
    <section id="content-agenda" className="section">
      <div className="container-full">
        <div className="flex flex-col gap-10">
          {(title || description) && (
            <div className="flex flex-col gap-4 max-w-3xl">
              {title && (
                <Animated delay={100}>
                  <h2 className="title-l">{title}</h2>
                </Animated>
              )}
              {description && (
                <Animated delay={200}>
                  <p className="content-l text-site-deep-green">{description}</p>
                </Animated>
              )}
            </div>
          )}

          {events.length > 0 ? (
            <ul className="m-0 list-none divide-y divide-site-deep-green/20 border-y border-site-deep-green/20 p-0">
              {events.map((event, index) => (
                <li key={event.id}>
                  <Animated delay={eventDelays[index % eventDelays.length]}>
                    <article className="grid gap-1 py-6 sm:grid-cols-[10rem_1fr_1fr] sm:items-baseline sm:gap-8">
                      <time dateTime={event.date} className="title-xs text-site-deep-green">
                        {formatEventDate(event.date)}
                      </time>
                      <h3 className="title-xs">{event.title}</h3>
                      <p className="content-m text-site-deep-green sm:text-right">{event.location}</p>
                    </article>
                  </Animated>
                </li>
              ))}
            </ul>
          ) : (
            <Animated delay={200}>
              <p className="content-l text-site-deep-green">No upcoming events right now. Check back soon.</p>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
