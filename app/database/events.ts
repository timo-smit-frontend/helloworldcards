export type Event = {
  id: number
  title: string
  date: string
  location: string
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function parseEventDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function upcomingEvents(events: Event[], now = new Date()): Event[] {
  const today = startOfDay(now)
  return [...events].filter((event) => parseEventDate(event.date) >= today).sort((a, b) => a.date.localeCompare(b.date))
}

export function eventsByIds(events: Event[], ids: Array<string | number>): Event[] {
  const byId = new Map(events.map((event) => [String(event.id), event]))
  return ids.map((id) => byId.get(String(id))).filter((event): event is Event => event != null)
}
