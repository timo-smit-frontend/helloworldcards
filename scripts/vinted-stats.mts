// What each Vinted listing gathered while it was up — views and likes, and whether Vinted
// held a new upload back — as the relist's own wardrobe reads kept it in
// .cache/vinted-stats.json(l). Asks Vinted nothing. Covers the last seven days;
// `npm run vinted:stats -- --days 14` a longer stretch.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HELD_BACK_AFTER_MS, READ_BEFORE_DOWN_MS, summarizeVintedStats, type VintedStatsGroup } from '../app/services/vinted-stats'
import { readVintedStats } from '../vite/vinted-stats'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const daysFlag = process.argv.indexOf('--days')
const days = daysFlag === -1 ? 7 : Number(process.argv[daysFlag + 1])
if (!Number.isInteger(days) || days < 1) {
  console.error('--days takes a whole number of days, 1 or more.')
  process.exit(1)
}

const listings = readVintedStats(root)
if (listings.length === 0) {
  console.log('Nothing on record yet. The stats fill in as the relist screen and the relists read the Vinted wardrobe.')
  process.exit(0)
}
const summary = summarizeVintedStats(listings, { days })

const dayLabel = (day: string, format: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...format }).format(new Date(`${day}T12:00:00Z`))
const readLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso))
const figure = (value: number | null, digits = 1) => (value == null ? '·' : value.toFixed(digits))
/** `Zorua AR 140/086 - BGS 9.5 - White Flare Japanese` → `Zorua AR 140/086`. */
const cardName = (title: string) => title.split(' - ')[0]
const minutes = (ms: number) => `${ms / 60_000} min`

function table(head: string[], rows: string[][]): string {
  const widths = head.map((cell, index) => Math.max(cell.length, ...rows.map((row) => row[index].length)))
  const line = (row: string[]) =>
    row.map((cell, index) => (index === 0 ? cell.padEnd(widths[index]) : cell.padStart(widths[index]))).join('  ')
  return [line(head), ...rows.map(line)].join('\n')
}

const GROUP_HEAD = ['Listings', 'Sold', 'Hours up', 'Views', 'Views/h', 'Likes', 'Held back']
const groupCells = (group: VintedStatsGroup) => [
  String(group.listings),
  String(group.sold),
  figure(group.hoursUp),
  figure(group.viewsPerListing),
  figure(group.viewsPerHour),
  figure(group.likesPerListing, 2),
  String(group.heldBack)
]

console.log(`Vinted views and likes, kept since ${readLabel(summary.since!)}, over the listings that came down (relisted or sold).`)
console.log(
  `Views and Likes are per listing, Views/h over all their hours up. Held back: Vinted still processing or hiding it ${minutes(HELD_BACK_AFTER_MS)} after it went up.`
)
console.log()
console.log(
  table(
    ['Went up', ...GROUP_HEAD],
    summary.days.map((day) => [dayLabel(day.day, { weekday: 'short', day: 'numeric', month: 'short' }), ...groupCells(day)])
  )
)
console.log()
console.log(
  table(
    ['Went up at', ...GROUP_HEAD],
    summary.timesOfDay.map((slot) => [
      `${String(slot.fromHour).padStart(2, '0')}:00–${String(slot.fromHour + 6).padStart(2, '0')}:00`,
      ...groupCells(slot)
    ])
  )
)
console.log()
console.log('Views per hour, by card and the day its listings went up')
console.log(
  table(
    ['Card', ...summary.days.map((day) => dayLabel(day.day, { weekday: 'short', day: 'numeric' })), 'All'],
    summary.cards.map((card) => [
      cardName(card.title),
      ...summary.days.map((day) => figure(card.viewsPerHour[day.day])),
      figure(card.all.viewsPerHour)
    ])
  )
)
console.log()
if (summary.unread > 0) {
  console.log(
    `Not counted: ${summary.unread} ${summary.unread === 1 ? 'listing' : 'listings'} that came down over ${minutes(READ_BEFORE_DOWN_MS)} after the last read of ${summary.unread === 1 ? 'it' : 'them'} (the first of a batch, when the relist screen had not been read just before).`
  )
}
console.log(
  `Up now: ${summary.upNow.listings} ${summary.upNow.listings === 1 ? 'listing' : 'listings'}, ${summary.upNow.heldBack} held back.`
)
