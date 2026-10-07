import { MAX_COMPS_KEPT, OUTLIER_MIN_COMPS, OUTLIER_RATIO } from './constants'
import type { Comp, CompSource, OwnHistory, SourceTally, Valuation } from './types'

export const COMP_SOURCES: readonly CompSource[] = ['cardmarket', 'marktplaats', 'vinted', 'ebay']

export const COMP_SOURCE_LABELS: Record<CompSource, string> = {
  cardmarket: 'Cardmarket',
  marktplaats: 'Marktplaats',
  vinted: 'Vinted',
  ebay: 'eBay EU'
}

/** Whole euros, rounded up — a figure on the dashboard never reads cheaper than it is. */
function euros(value: number): string {
  return `€${Math.ceil(value)}`
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function summarise(perSource: SourceTally[], own: OwnHistory): string {
  const parts = perSource
    .filter((tally) => tally.count > 0 && tally.lowest != null)
    .map((tally) => `${COMP_SOURCE_LABELS[tally.source]} from ${euros(tally.lowest!)}${tally.count > 1 ? ` (${tally.count})` : ''}`)

  const lastSale = own.sold[0]
  if (lastSale) {
    parts.push(`you sold one for ${euros(lastSale.price)}${lastSale.daysToSell != null ? ` in ${lastSale.daysToSell} days` : ''}`)
  }
  const stocked = own.inStock[0]
  if (stocked) {
    parts.push(`you have one listed at ${euros(stocked.price)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Nobody else is selling this card'
}

/**
 * What a card can be sold for, from everyone else selling it.
 *
 * Every competitor counts the same whichever site it is on, because a buyer who finds
 * the card will find the cheapest of them too: the expected sale is the cheapest one that
 * is believable. Believable means not absurdly far under the rest — a slab at half what
 * everyone else asks is a raw card, a wrong grade or a scam, and pricing against it would
 * throw away a real deal on the strength of a listing that is not real competition.
 */
export function valueCard({
  comps,
  own,
  notes = {}
}: {
  comps: Comp[]
  own: OwnHistory
  /** Why a source has nothing, for the sources that do not — "page not found", "not set up". */
  notes?: Partial<Record<CompSource, string>>
}): Valuation {
  const unique = [...new Map(comps.map((comp) => [comp.id, comp])).values()].sort(
    (left, right) => left.price - right.price || left.id.localeCompare(right.id)
  )

  const floorOfBelief = unique.length >= OUTLIER_MIN_COMPS ? median(unique.map((comp) => comp.price)) * OUTLIER_RATIO : 0
  const credible = unique.filter((comp) => comp.price >= floorOfBelief)
  const outliers = unique.filter((comp) => comp.price < floorOfBelief)

  const perSource: SourceTally[] = COMP_SOURCES.map((source) => {
    const mine = credible.filter((comp) => comp.source === source)
    return {
      source,
      count: mine.length,
      lowest: mine[0]?.price ?? null,
      note: mine.length === 0 ? (notes[source] ?? null) : null
    }
  })

  const sourcesWithComps = perSource.filter((tally) => tally.count > 0).length
  const confidence: Valuation['confidence'] =
    credible.length === 0 ? 'none' : sourcesWithComps >= 2 ? 'strong' : credible.length >= 2 ? 'fair' : 'thin'

  return {
    expectedSale: credible[0]?.price ?? null,
    basis: credible[0] ?? null,
    comps: credible.slice(0, MAX_COMPS_KEPT),
    outliers: outliers.slice(0, MAX_COMPS_KEPT),
    perSource,
    own,
    confidence,
    summary: summarise(perSource, own)
  }
}

/** The books of a shop that has never had the card. */
export function emptyOwnHistory(): OwnHistory {
  return { sold: [], inStock: [], characterDaysToSell: null, characterSales: 0 }
}
