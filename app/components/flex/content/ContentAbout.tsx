import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import Pokemon from '~/components/elements/Pokemon'
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
  people: Array<{ name: string; description: string; pokemonIds?: number[] }>
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
              <ul className="m-0 grid list-none grid-cols-1 items-stretch gap-5 p-0 lg:grid-cols-2">
                {people.map((person) => {
                  const pokemonIds = person.pokemonIds ?? []

                  return (
                    <li
                      key={person.name}
                      className="flex h-full flex-col gap-3 rounded-panel bg-site-gunmetal px-6 lg:pt-8 pt-6 pb-4 shadow-card ring-1 ring-site-mulled-wine sm:px-8"
                    >
                      <h3 className="title-l">{person.name}</h3>
                      <p className="content-m text-site-mantle -mb-2">{person.description}</p>
                      {pokemonIds.length > 0 && (
                        <div className="mt-auto flex w-full flex-nowrap">
                          {pokemonIds.map((id) => (
                            <div key={id} className="min-w-0 shrink-0" style={{ width: `${100 / pokemonIds.length}%` }}>
                              <Pokemon id={id} className="h-auto w-full" />
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
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
