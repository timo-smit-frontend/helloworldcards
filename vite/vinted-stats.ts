import fs from 'node:fs'
import path from 'node:path'
import type { VintedWardrobeItem } from '../app/services/vinted-relist'
import { mergeListingStats, observeWardrobe, type VintedListingStats } from '../app/services/vinted-stats'

/** The listings still in the wardrobe, as of the last read. Small: it is written whole on every read. */
const OPEN_FILE = path.join('.cache', 'vinted-stats.json')
/** The listings that have left the wardrobe, one line each, only ever added to. */
const HISTORY_FILE = path.join('.cache', 'vinted-stats.jsonl')

/** Where every wardrobe read goes, to be kept per listing. */
export type VintedStatsRecorder = {
  /** Never throws: the stats are no reason for a relist to stop. */
  record(wardrobe: VintedWardrobeItem[], at: Date): void
}

function readOpen(root: string): Record<string, VintedListingStats> {
  const file = path.join(root, OPEN_FILE)
  if (!fs.existsSync(file)) {
    return {}
  }
  try {
    return (JSON.parse(fs.readFileSync(file, 'utf8')) as { listings?: Record<string, VintedListingStats> }).listings ?? {}
  } catch {
    return {}
  }
}

/**
 * The stats in `.cache`. The listings that are done go to the history before the open ones
 * are written without them, and the open file is swapped in whole, so a stop halfway
 * leaves a listing written down twice rather than not at all — which reading merges.
 */
export function fileVintedStatsRecorder(root: string): VintedStatsRecorder {
  return {
    record(wardrobe, at) {
      try {
        const { open, finished } = observeWardrobe(readOpen(root), wardrobe, at)
        fs.mkdirSync(path.join(root, '.cache'), { recursive: true })
        if (finished.length > 0) {
          fs.appendFileSync(path.join(root, HISTORY_FILE), finished.map((listing) => `${JSON.stringify(listing)}\n`).join(''))
        }
        const file = path.join(root, OPEN_FILE)
        fs.writeFileSync(`${file}.tmp`, JSON.stringify({ listings: open }))
        fs.renameSync(`${file}.tmp`, file)
      } catch (error) {
        console.warn(`[vinted-stats] Could not keep the wardrobe read: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

/** Every listing on record, done and still up, one record each. */
export function readVintedStats(root: string): VintedListingStats[] {
  const byId = new Map<string, VintedListingStats>()
  const add = (listing: VintedListingStats) => {
    const known = byId.get(listing.itemId)
    byId.set(listing.itemId, known ? mergeListingStats(known, listing) : listing)
  }

  const history = path.join(root, HISTORY_FILE)
  if (fs.existsSync(history)) {
    for (const line of fs.readFileSync(history, 'utf8').split('\n')) {
      if (!line.trim()) {
        continue
      }
      try {
        add(JSON.parse(line) as VintedListingStats)
      } catch {
        // A line cut short by a stop halfway through writing it.
      }
    }
  }
  for (const listing of Object.values(readOpen(root))) {
    add(listing)
  }
  return [...byId.values()]
}
