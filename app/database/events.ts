export type Event = {
  id: number
  title: string
  date: string
  location: string
}

const events: Event[] = [
  {
    id: 1,
    title: 'Utrecht Card Show',
    date: '2026-09-12',
    location: 'Jaarbeurs, Utrecht'
  },
  {
    id: 2,
    title: 'Pokémon Regional Championships',
    date: '2026-10-03',
    location: 'RAI, Amsterdam'
  },
  {
    id: 3,
    title: 'Play! Pokémon League Challenge',
    date: '2026-10-18',
    location: 'Spellenhuis, Rotterdam'
  },
  {
    id: 4,
    title: 'Belgian TCG Open',
    date: '2026-11-07',
    location: 'Flanders Expo, Ghent'
  },
  {
    id: 5,
    title: 'Winter Collector Fair',
    date: '2026-12-05',
    location: 'Jaarbeurs, Utrecht'
  }
]

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function parseEventDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function getAllEvents(): Event[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date))
}

export function getUpcomingEvents(): Event[] {
  const today = startOfDay(new Date())

  return getAllEvents().filter((event) => parseEventDate(event.date) >= today)
}

export function getEventsByIds(ids: Array<string | number>): Event[] {
  const byId = new Map(events.map((event) => [String(event.id), event]))

  return ids.map((id) => byId.get(String(id))).filter((event): event is Event => event != null)
}
