import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import useLocationFinder from '~/hooks/useLocationFinder'
import { cn } from '~/services/utils'

export default function ContentAbout({
  title,
  description,
  people,
  peopleCaption
}: {
  title: string
  description: string
  people: Array<{ name: string; description: string }>
  peopleCaption: string
}) {
  const { ref, isFirst } = useLocationFinder()

  return (
    <section id="content-about" ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div className="flex flex-col gap-12 lg:gap-16">
          <div className="flex max-w-4xl flex-col gap-8">
            {isFirst && <Breadcrumbs />}
            <div className="flex flex-col gap-2 lg:gap-4">
              <Animated delay={100}>
                <h2 className="title-l">{title}</h2>
              </Animated>
              <Animated delay={200}>
                <p className="content-l text-site-mantle">{description}</p>
              </Animated>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Animated delay={200}>
              <ul className="m-0 grid list-none grid-cols-1 items-stretch gap-5 p-0 sm:grid-cols-2">
                {people.map((person) => (
                  <li
                    key={person.name}
                    className="flex h-full flex-col gap-3 rounded-panel bg-site-gunmetal px-6 py-8 shadow-card ring-1 ring-site-mulled-wine sm:px-8 sm:py-10"
                  >
                    <h3 className="title-l">{person.name}</h3>
                    <p className="content-m text-site-mantle">{person.description}</p>
                  </li>
                ))}
              </ul>
            </Animated>
            <Animated delay={300}>
              <p className="content-s text-site-mantle">{peopleCaption}</p>
            </Animated>
          </div>
        </div>
      </div>
    </section>
  )
}
