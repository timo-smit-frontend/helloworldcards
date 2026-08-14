import ContentAgenda from '~/components/flex/content/ContentAgenda'

export default function Agenda() {
  return (
    <>
      <h1 className="sr-only">Agenda</h1>
      <ContentAgenda
        title="Upcoming events"
        description="We'll be at these Pokémon events. Come say hi, browse the stall, and see what's new."
      />
    </>
  )
}
