import { wardrobePrice, wardrobeUploadedAt, type VintedWardrobeItem } from './vinted-relist'

/**
 * Views and likes on Vinted, kept over each listing's life.
 *
 * The relist screen shows what a listing has gathered since it last went up, and a
 * relist starts it from zero again, so the screen cannot say whether a card does worse
 * than it used to. The relist reads the seller's wardrobe all the time anyway — to see
 * each delete through, to find each copy, on every look at the screen — and every read
 * has each listing's views and likes and whether buyers can see it yet. Kept per
 * listing, those reads say what a listing gathered in the hours it was up. No read is
 * made for this.
 */

/** A flag of the wardrobe's the relist itself has no use for: Vinted is still working on a new upload. */
type StatsWardrobeItem = VintedWardrobeItem & { is_processing?: boolean }

/** One listing, from the first wardrobe read that had it to the last. */
export type VintedListingStats = {
  itemId: string
  title: string
  /** Euros, at the last read. */
  price: number | null
  /** When it went up: Vinted's stamp on its main photo. Null when the wardrobe had none. */
  uploadedAt: string | null
  /** The first and the last read that had it. */
  firstSeenAt: string
  lastSeenAt: string
  /** The first read that had it neither processing nor hidden: buyers could find it from then on. */
  visibleAt: string | null
  /** The last read that still had it processing or hidden. */
  lastHiddenAt: string | null
  /** The first read that had it closed or reserved — sold, as a rule. Its views and likes are kept as they were then. */
  closedAt: string | null
  /** The first read that no longer had it: deleted for a relist, as a rule. */
  goneAt: string | null
  /** As of the last read (or of `closedAt`); null while Vinted has not said. */
  views: number | null
  likes: number | null
  /** `[read, views, likes]` at the first read, and at every read that found them changed. */
  samples: Array<[string, number | null, number | null]>
}

/**
 * Take one wardrobe read into the listings of the last one.
 *
 * Answers the listings the wardrobe has now, and the ones that have left it since, done.
 * A read without a single listing while listings were up at the last one is taken for a
 * hiccup of Vinted's rather than everything gone at once, and changes nothing. Drafts
 * are nobody's to see, and are left out.
 */
export function observeWardrobe(
  open: Record<string, VintedListingStats>,
  wardrobe: VintedWardrobeItem[],
  now: Date
): { open: Record<string, VintedListingStats>; finished: VintedListingStats[] } {
  const items = (wardrobe as StatsWardrobeItem[]).filter((item) => !item.is_draft)
  if (items.length === 0 && Object.values(open).some((listing) => listing.closedAt == null)) {
    return { open, finished: [] }
  }

  const at = now.toISOString()
  const next: Record<string, VintedListingStats> = {}
  for (const item of items) {
    const itemId = String(item.id)
    const uploadedAt = wardrobeUploadedAt(item, now)
    const listing: VintedListingStats = open[itemId]
      ? { ...open[itemId], samples: [...open[itemId].samples] }
      : {
          itemId,
          title: item.title,
          price: null,
          uploadedAt: null,
          firstSeenAt: at,
          lastSeenAt: at,
          visibleAt: null,
          lastHiddenAt: null,
          closedAt: null,
          goneAt: null,
          views: null,
          likes: null,
          samples: []
        }
    listing.title = item.title
    listing.lastSeenAt = at
    listing.uploadedAt ??= uploadedAt != null ? new Date(uploadedAt).toISOString() : null

    if (listing.closedAt == null) {
      listing.price = wardrobePrice(item) ?? listing.price
      const views = typeof item.view_count === 'number' ? item.view_count : listing.views
      const likes = typeof item.favourite_count === 'number' ? item.favourite_count : listing.likes
      const last = listing.samples.at(-1)
      if (!last || last[1] !== views || last[2] !== likes) {
        listing.samples.push([at, views, likes])
      }
      listing.views = views
      listing.likes = likes
      if (item.is_closed || item.is_reserved) {
        listing.closedAt = at
      } else if (item.is_processing || item.is_hidden) {
        listing.lastHiddenAt = at
      } else {
        listing.visibleAt ??= at
      }
    }
    next[itemId] = listing
  }

  const finished = Object.values(open)
    .filter((listing) => !(listing.itemId in next))
    .map((listing) => ({ ...listing, goneAt: at }))
  return { open: next, finished }
}

/**
 * One listing out of two records of it. A listing that came back after a read that did not
 * have it — Vinted leaving it out of one answer — was written down as done in between, and
 * then again from where it came back; a stop halfway through writing a read down can leave
 * the same record twice.
 */
export function mergeListingStats(a: VintedListingStats, b: VintedListingStats): VintedListingStats {
  const [early, late] = Date.parse(a.firstSeenAt) <= Date.parse(b.firstSeenAt) ? [a, b] : [b, a]
  const samples = new Map([...early.samples, ...late.samples].map((sample) => [sample[0], sample]))
  return {
    ...late,
    uploadedAt: early.uploadedAt ?? late.uploadedAt,
    firstSeenAt: early.firstSeenAt,
    visibleAt: early.visibleAt ?? late.visibleAt,
    lastHiddenAt: late.lastHiddenAt ?? early.lastHiddenAt,
    closedAt: early.closedAt ?? late.closedAt,
    samples: [...samples.values()].sort((x, y) => Date.parse(x[0]) - Date.parse(y[0]))
  }
}

/** Days and hours are the shop's own: Amsterdam time. */
const ZONE = 'Europe/Amsterdam'
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const HOUR_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', hourCycle: 'h23' })

/** `2026-09-30`, the day in Amsterdam. */
export function amsterdamDay(at: Date | string): string {
  return DAY_FORMAT.format(typeof at === 'string' ? new Date(at) : at)
}

function amsterdamHour(at: string): number {
  return Number(HOUR_FORMAT.format(new Date(at)))
}

/** The `count` days up to and including `today`, oldest first. */
function daysUpTo(today: string, count: number): string[] {
  const [year, month, day] = today.split('-').map(Number)
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day - (count - 1 - index))).toISOString().slice(0, 10)
  )
}

/** Vinted still processing or hiding a new listing this long after it went up is holding it back. */
export const HELD_BACK_AFTER_MS = 10 * 60_000

/** Held back: still processing or hidden at a read `HELD_BACK_AFTER_MS` or more after it went up. */
function heldBack(listing: VintedListingStats): boolean {
  if (!listing.uploadedAt || !listing.lastHiddenAt) {
    return false
  }
  return Date.parse(listing.lastHiddenAt) - Date.parse(listing.uploadedAt) >= HELD_BACK_AFTER_MS
}

/**
 * A listing that came down more than this long after the last read that had it is not
 * counted: what it gathered in its last stretch was never read. Within a batch every
 * listing is read by the relist before it, seconds before its own delete; the first of a
 * batch only by the relist screen's own read, which is recent when the screen was
 * opened or refreshed just before, and hours old when it was left open since the last batch.
 */
export const READ_BEFORE_DOWN_MS = 10 * 60_000

/**
 * How long a listing that has come down was up — until its sale, or until the last read
 * that had it — or why it does not count: still up, or not read near the end. One that
 * was sold before the first read on record does not count either: when it sold is not known.
 */
function hoursUp(listing: VintedListingStats): number | 'up' | 'unread' | null {
  if (listing.closedAt == null && listing.goneAt == null) {
    return 'up'
  }
  if (!listing.uploadedAt || listing.closedAt === listing.firstSeenAt) {
    return null
  }
  if (listing.closedAt == null && Date.parse(listing.goneAt!) - Date.parse(listing.lastSeenAt) > READ_BEFORE_DOWN_MS) {
    return 'unread'
  }
  const hours = (Date.parse(listing.closedAt ?? listing.lastSeenAt) - Date.parse(listing.uploadedAt)) / 3_600_000
  return hours > 0 ? hours : null
}

/** What a set of listings gathered while they were up. */
export type VintedStatsGroup = {
  listings: number
  sold: number
  /** The mean hours a listing was up. */
  hoursUp: number | null
  viewsPerListing: number | null
  /** All their views over all their hours up. */
  viewsPerHour: number | null
  likesPerListing: number | null
  /** Listings Vinted still had processing or hidden `HELD_BACK_AFTER_MS` or more after they went up. */
  heldBack: number
}

type Counted = { listing: VintedListingStats; hours: number }

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function statsGroup(counted: Counted[]): VintedStatsGroup {
  const withViews = counted.filter((entry) => entry.listing.views != null)
  const withLikes = counted.filter((entry) => entry.listing.likes != null)
  const viewHours = sum(withViews.map((entry) => entry.hours))
  return {
    listings: counted.length,
    sold: counted.filter((entry) => entry.listing.closedAt != null).length,
    hoursUp: counted.length > 0 ? sum(counted.map((entry) => entry.hours)) / counted.length : null,
    viewsPerListing: withViews.length > 0 ? sum(withViews.map((entry) => entry.listing.views!)) / withViews.length : null,
    viewsPerHour: viewHours > 0 ? sum(withViews.map((entry) => entry.listing.views!)) / viewHours : null,
    likesPerListing: withLikes.length > 0 ? sum(withLikes.map((entry) => entry.listing.likes!)) / withLikes.length : null,
    heldBack: counted.filter((entry) => heldBack(entry.listing)).length
  }
}

export type VintedStatsSummary = {
  /** The first read on record. */
  since: string | null
  /** The days of the window, oldest first, each with the listings that went up on it. */
  days: Array<VintedStatsGroup & { day: string }>
  /** Per card, by listing title: views per hour on each day of the window (null on a day it had none), and over all of them. */
  cards: Array<{ title: string; viewsPerHour: Record<string, number | null>; all: VintedStatsGroup }>
  /** By the six hours of the day the listings went up in, from midnight. */
  timesOfDay: Array<VintedStatsGroup & { fromHour: number }>
  /** Listings of the window that came down without a read in the `READ_BEFORE_DOWN_MS` before, and are not counted. */
  unread: number
  /** The listings up right now, and how many of those Vinted is holding back. */
  upNow: { listings: number; heldBack: number }
}

/**
 * Views and likes over the last `days` days, counted over the listings that have come
 * down — relisted, or sold — by the day and the hour they went up. A listing still up
 * is still gathering, and would count short.
 */
export function summarizeVintedStats(listings: VintedListingStats[], { now = new Date(), days = 7 } = {}): VintedStatsSummary {
  const window = daysUpTo(amsterdamDay(now), days)
  const inWindow = (listing: VintedListingStats) => listing.uploadedAt != null && window.includes(amsterdamDay(listing.uploadedAt))
  const counted: Array<Counted & { day: string }> = listings.flatMap((listing) => {
    const hours = hoursUp(listing)
    return typeof hours === 'number' && inWindow(listing) ? [{ listing, hours, day: amsterdamDay(listing.uploadedAt!) }] : []
  })

  const titles = [...new Set(counted.map((entry) => entry.listing.title))].sort((a, b) => a.localeCompare(b))
  const up = listings.filter((listing) => hoursUp(listing) === 'up')
  const firstReads = listings.map((listing) => listing.firstSeenAt).sort()

  return {
    since: firstReads[0] ?? null,
    days: window.map((day) => ({ day, ...statsGroup(counted.filter((entry) => entry.day === day)) })),
    cards: titles.map((title) => {
      const own = counted.filter((entry) => entry.listing.title === title)
      return {
        title,
        viewsPerHour: Object.fromEntries(window.map((day) => [day, statsGroup(own.filter((entry) => entry.day === day)).viewsPerHour])),
        all: statsGroup(own)
      }
    }),
    timesOfDay: [0, 6, 12, 18].map((fromHour) => ({
      fromHour,
      ...statsGroup(
        counted.filter((entry) => {
          const hour = amsterdamHour(entry.listing.uploadedAt!)
          return hour >= fromHour && hour < fromHour + 6
        })
      )
    })),
    unread: listings.filter((listing) => hoursUp(listing) === 'unread' && inWindow(listing)).length,
    upNow: { listings: up.length, heldBack: up.filter(heldBack).length }
  }
}
