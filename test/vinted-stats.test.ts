import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VintedWardrobeItem } from '../app/services/vinted-relist'
import {
  amsterdamDay,
  mergeListingStats,
  observeWardrobe,
  summarizeVintedStats,
  type VintedListingStats
} from '../app/services/vinted-stats'
import { fileVintedStatsRecorder, readVintedStats } from '../vite/vinted-stats'

/** A wardrobe item as Vinted answers it for the seller: views and likes, and whether it is still being processed. */
function item(
  id: number,
  fields: Partial<VintedWardrobeItem & { is_processing: boolean }> & { uploaded?: string } = {}
): VintedWardrobeItem {
  const { uploaded = '2026-09-30T15:40:00Z', ...rest } = fields
  return {
    id,
    title: `Card ${id} - PSA 9`,
    price: { amount: '49.99' },
    view_count: 0,
    favourite_count: 0,
    is_hidden: false,
    is_processing: false,
    photos: [{ high_resolution: { timestamp: Date.parse(uploaded) / 1000 } }],
    ...rest
  } as VintedWardrobeItem
}

const at = (iso: string) => new Date(iso)

/** Every read in turn, from nothing on record. */
function observeAll(reads: Array<[string, VintedWardrobeItem[]]>) {
  let open: Record<string, VintedListingStats> = {}
  const finished: VintedListingStats[] = []
  for (const [when, wardrobe] of reads) {
    const result = observeWardrobe(open, wardrobe, at(when))
    open = result.open
    finished.push(...result.finished)
  }
  return { open, finished }
}

describe('observeWardrobe', () => {
  it('starts a listing at the first read that has it, with when it went up and what it has gathered', () => {
    const { open } = observeAll([['2026-09-30T15:41:00Z', [item(1, { view_count: 3, favourite_count: 1 })]]])

    expect(open['1']).toEqual({
      itemId: '1',
      title: 'Card 1 - PSA 9',
      price: 49.99,
      uploadedAt: '2026-09-30T15:40:00.000Z',
      firstSeenAt: '2026-09-30T15:41:00.000Z',
      lastSeenAt: '2026-09-30T15:41:00.000Z',
      visibleAt: '2026-09-30T15:41:00.000Z',
      lastHiddenAt: null,
      closedAt: null,
      goneAt: null,
      views: 3,
      likes: 1,
      samples: [['2026-09-30T15:41:00.000Z', 3, 1]]
    })
  })

  it('adds a sample only when the views or likes have changed, and keeps the last read that had the listing', () => {
    const { open } = observeAll([
      ['2026-09-30T15:41:00Z', [item(1, { view_count: 0 })]],
      ['2026-09-30T15:42:00Z', [item(1, { view_count: 0 })]],
      ['2026-09-30T16:10:00Z', [item(1, { view_count: 4 })]],
      ['2026-09-30T16:40:00Z', [item(1, { view_count: 4, favourite_count: 1 })]]
    ])

    expect(open['1'].samples).toEqual([
      ['2026-09-30T15:41:00.000Z', 0, 0],
      ['2026-09-30T16:10:00.000Z', 4, 0],
      ['2026-09-30T16:40:00.000Z', 4, 1]
    ])
    expect(open['1'].lastSeenAt).toBe('2026-09-30T16:40:00.000Z')
    expect([open['1'].views, open['1'].likes]).toEqual([4, 1])
  })

  it('keeps when a new listing was still processing or hidden, and when buyers could first see it', () => {
    const { open } = observeAll([
      ['2026-09-30T15:40:05Z', [item(1, { is_processing: true, is_hidden: true })]],
      ['2026-09-30T15:40:30Z', [item(1, { is_hidden: true })]],
      ['2026-09-30T15:41:00Z', [item(1)]]
    ])

    expect(open['1'].lastHiddenAt).toBe('2026-09-30T15:40:30.000Z')
    expect(open['1'].visibleAt).toBe('2026-09-30T15:41:00.000Z')
  })

  it('hands back a listing the wardrobe no longer has, done at that read', () => {
    const { open, finished } = observeAll([
      ['2026-09-30T15:41:00Z', [item(1, { view_count: 2 }), item(2)]],
      ['2026-09-30T17:00:00Z', [item(1, { view_count: 7 }), item(2)]],
      // Listing 1 was deleted for a relist, and its copy is up.
      ['2026-09-30T17:00:20Z', [item(2), item(3, { uploaded: '2026-09-30T17:00:15Z' })]]
    ])

    expect(Object.keys(open).sort()).toEqual(['2', '3'])
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({ itemId: '1', views: 7, lastSeenAt: '2026-09-30T17:00:00.000Z', goneAt: '2026-09-30T17:00:20.000Z' })
  })

  it('keeps a sold listing as it was at the read that found it closed', () => {
    const { open } = observeAll([
      ['2026-09-30T15:41:00Z', [item(1, { view_count: 5 })]],
      ['2026-09-30T18:00:00Z', [item(1, { view_count: 9, favourite_count: 2, is_closed: true })]],
      ['2026-09-30T21:00:00Z', [item(1, { view_count: 12, favourite_count: 2, is_closed: true })]]
    ])

    expect(open['1']).toMatchObject({ closedAt: '2026-09-30T18:00:00.000Z', views: 9, likes: 2, lastSeenAt: '2026-09-30T21:00:00.000Z' })
  })

  it('leaves views and likes unknown while Vinted does not say them, rather than taking them for none', () => {
    const { open } = observeAll([
      ['2026-09-30T15:41:00Z', [item(1, { view_count: undefined, favourite_count: undefined })]],
      ['2026-09-30T16:00:00Z', [item(1, { view_count: 3, favourite_count: undefined })]]
    ])

    expect([open['1'].views, open['1'].likes]).toEqual([3, null])
    expect(open['1'].samples).toEqual([
      ['2026-09-30T15:41:00.000Z', null, null],
      ['2026-09-30T16:00:00.000Z', 3, null]
    ])
  })

  it('takes an empty read while listings are up for a hiccup, and leaves drafts out', () => {
    const first = observeWardrobe({}, [item(1), item(2, { is_draft: true })], at('2026-09-30T15:41:00Z'))
    expect(Object.keys(first.open)).toEqual(['1'])

    const empty = observeWardrobe(first.open, [], at('2026-09-30T15:42:00Z'))
    expect(empty).toEqual({ open: first.open, finished: [] })
  })
})

describe('mergeListingStats', () => {
  it('joins a listing written down as done with the record from where it came back', () => {
    const { finished } = observeAll([
      ['2026-09-30T15:41:00Z', [item(1, { view_count: 1 })]],
      ['2026-09-30T15:42:00Z', [item(2)]]
    ])
    const { open } = observeAll([['2026-09-30T15:43:00Z', [item(1, { view_count: 2 })]]])

    const merged = mergeListingStats(open['1'], finished[0])
    expect(merged).toMatchObject({
      firstSeenAt: '2026-09-30T15:41:00.000Z',
      lastSeenAt: '2026-09-30T15:43:00.000Z',
      goneAt: null,
      views: 2
    })
    expect(merged.samples).toEqual([
      ['2026-09-30T15:41:00.000Z', 1, 0],
      ['2026-09-30T15:43:00.000Z', 2, 0]
    ])
    // The same record twice is still one listing, with each sample once.
    expect(mergeListingStats(finished[0], finished[0]).samples).toEqual(finished[0].samples)
  })
})

/** A listing on record: up at `up`, last seen at `last`, and gone, sold, or still up. */
function listing(
  itemId: string,
  title: string,
  up: string,
  last: string,
  fields: Partial<VintedListingStats> & { end?: 'gone' | 'sold' | 'up' } = {}
): VintedListingStats {
  const { end = 'gone', ...rest } = fields
  return {
    itemId,
    title,
    price: 49.99,
    uploadedAt: up,
    firstSeenAt: up,
    lastSeenAt: last,
    visibleAt: up,
    lastHiddenAt: null,
    closedAt: end === 'sold' ? last : null,
    goneAt: end === 'gone' ? last : null,
    views: 0,
    likes: 0,
    samples: [],
    ...rest
  }
}

describe('summarizeVintedStats', () => {
  const now = new Date('2026-10-02T20:00:00Z')

  it('counts the listings that came down by the Amsterdam day they went up, over their hours up', () => {
    const summary = summarizeVintedStats(
      [
        // 23:30 UTC on the 29th is half past one on the 30th in Amsterdam.
        listing('1', 'Ekans', '2026-09-29T23:30:00Z', '2026-09-30T01:30:00Z', { views: 6, likes: 1 }),
        listing('2', 'Zorua', '2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z', { views: 2, likes: 0 }),
        listing('3', 'Ekans', '2026-10-01T10:00:00Z', '2026-10-01T13:00:00Z', { views: 3, likes: 0, end: 'sold' }),
        // Still up: still gathering, so not counted yet.
        listing('4', 'Zorua', '2026-10-02T19:00:00Z', '2026-10-02T19:50:00Z', { views: 1, end: 'up' })
      ],
      { now, days: 3 }
    )

    expect(summary.days.map((day) => day.day)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
    expect(summary.days[0]).toMatchObject({
      listings: 2,
      sold: 0,
      hoursUp: 1.5,
      viewsPerListing: 4,
      viewsPerHour: 8 / 3,
      likesPerListing: 0.5
    })
    expect(summary.days[1]).toMatchObject({ listings: 1, sold: 1, hoursUp: 3, viewsPerHour: 1 })
    expect(summary.days[2]).toMatchObject({ listings: 0, hoursUp: null, viewsPerHour: null })
    expect(summary.upNow).toEqual({ listings: 1, heldBack: 0 })
    expect(summary.since).toBe('2026-09-29T23:30:00Z')
  })

  it('gives each card its views per hour per day, and nothing on a day it had no listing', () => {
    const summary = summarizeVintedStats(
      [
        listing('1', 'Ekans', '2026-09-30T10:00:00Z', '2026-09-30T12:00:00Z', { views: 4 }),
        listing('2', 'Ekans', '2026-10-02T10:00:00Z', '2026-10-02T11:00:00Z', { views: 1 }),
        listing('3', 'Arceus', '2026-10-02T10:00:00Z', '2026-10-02T12:00:00Z', { views: 6 })
      ],
      { now, days: 3 }
    )

    expect(summary.cards.map((card) => card.title)).toEqual(['Arceus', 'Ekans'])
    expect(summary.cards[1].viewsPerHour).toEqual({ '2026-09-30': 2, '2026-10-01': null, '2026-10-02': 1 })
    expect(summary.cards[1].all).toMatchObject({ listings: 2, viewsPerHour: 5 / 3 })
  })

  it('splits the day by the Amsterdam hour the listings went up in', () => {
    const summary = summarizeVintedStats(
      [
        // 17:30 UTC is half past seven in the evening in Amsterdam, in summer time.
        listing('1', 'Ekans', '2026-10-01T17:30:00Z', '2026-10-01T18:30:00Z', { views: 5 }),
        listing('2', 'Ekans', '2026-10-01T07:00:00Z', '2026-10-01T08:00:00Z', { views: 1 })
      ],
      { now, days: 3 }
    )

    expect(summary.timesOfDay.map((slot) => [slot.fromHour, slot.listings, slot.viewsPerHour])).toEqual([
      [0, 0, null],
      [6, 1, 1],
      [12, 0, null],
      [18, 1, 5]
    ])
  })

  it('counts a listing as held back only when it was still processing or hidden ten minutes after it went up', () => {
    const summary = summarizeVintedStats(
      [
        listing('1', 'Ekans', '2026-10-02T10:00:00Z', '2026-10-02T11:00:00Z', { lastHiddenAt: '2026-10-02T10:00:30Z' }),
        listing('2', 'Ekans', '2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z', { lastHiddenAt: '2026-10-02T12:12:00Z' }),
        listing('3', 'Zorua', '2026-10-02T19:00:00Z', '2026-10-02T19:20:00Z', { lastHiddenAt: '2026-10-02T19:20:00Z', end: 'up' })
      ],
      { now, days: 1 }
    )

    expect(summary.days[0].heldBack).toBe(1)
    expect(summary.upNow).toEqual({ listings: 1, heldBack: 1 })
  })

  it('leaves out a listing that came down long after the last read that had it, and says how many', () => {
    const summary = summarizeVintedStats(
      [
        // Read 20 seconds before its delete, by the relist before it in the batch.
        listing('1', 'Ekans', '2026-10-02T10:00:00Z', '2026-10-02T12:00:00Z', { views: 4, goneAt: '2026-10-02T12:00:20Z' }),
        // First of the batch, with the relist screen read at the end of the batch before.
        listing('2', 'Zorua', '2026-10-02T10:00:00Z', '2026-10-02T10:05:00Z', { views: 0, goneAt: '2026-10-02T11:59:50Z' })
      ],
      { now, days: 1 }
    )

    expect(summary.days[0]).toMatchObject({ listings: 1, viewsPerHour: 2 })
    expect(summary.cards.map((card) => card.title)).toEqual(['Ekans'])
    expect(summary.unread).toBe(1)
  })

  it('leaves out a listing that was sold before the first read, since when it sold is not known', () => {
    const sold = listing('1', 'Zekrom', '2026-10-01T10:00:00Z', '2026-10-02T19:00:00Z', { end: 'sold', views: 10 })
    sold.firstSeenAt = sold.closedAt!

    expect(summarizeVintedStats([sold], { now, days: 3 }).days.every((day) => day.listings === 0)).toBe(true)
  })

  it('takes Amsterdam days, winter time included', () => {
    expect(amsterdamDay('2026-10-25T22:30:00Z')).toBe('2026-10-25')
    expect(amsterdamDay('2026-10-25T23:30:00Z')).toBe('2026-10-26')
  })
})

describe('the stats in .cache', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
    vi.restoreAllMocks()
  })
  const tempRoot = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hwc-vinted-stats-'))
    roots.push(root)
    return root
  }

  it('keeps the listings still up in one file and adds the ones that came down to another', () => {
    const root = tempRoot()
    const stats = fileVintedStatsRecorder(root)

    stats.record([item(1, { view_count: 2 }), item(2)], at('2026-09-30T15:41:00Z'))
    stats.record([item(2), item(3)], at('2026-09-30T17:00:20Z'))

    const open = JSON.parse(fs.readFileSync(path.join(root, '.cache/vinted-stats.json'), 'utf8')) as { listings: object }
    expect(Object.keys(open.listings).sort()).toEqual(['2', '3'])
    const history = fs.readFileSync(path.join(root, '.cache/vinted-stats.jsonl'), 'utf8').trim().split('\n')
    expect(history.map((line) => (JSON.parse(line) as VintedListingStats).itemId)).toEqual(['1'])

    const all = readVintedStats(root)
    expect(all.map((entry) => entry.itemId).sort()).toEqual(['1', '2', '3'])
    expect(all.find((entry) => entry.itemId === '1')).toMatchObject({ views: 2, goneAt: '2026-09-30T17:00:20.000Z' })
  })

  it('starts over from a file it cannot read, and never lets a failed write stop the relist', () => {
    const root = tempRoot()
    fs.mkdirSync(path.join(root, '.cache'))
    fs.writeFileSync(path.join(root, '.cache/vinted-stats.json'), '{"listings": {"1": ')
    fs.writeFileSync(path.join(root, '.cache/vinted-stats.jsonl'), '{"itemId": "9", "firstSe')

    fileVintedStatsRecorder(root).record([item(1)], at('2026-09-30T15:41:00Z'))
    expect(readVintedStats(root).map((entry) => entry.itemId)).toEqual(['1'])

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const notADirectory = path.join(tempRoot(), 'file')
    fs.writeFileSync(notADirectory, '')
    expect(() => fileVintedStatsRecorder(notADirectory).record([item(1)], at('2026-09-30T15:41:00Z'))).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[vinted-stats]'))
  })
})
