import { DEAL_SOURCES, MIN_EDGE } from './constants'
import type { DealFinderReport, DealRow, DealSource, NoCompsRow, ProblemRow, SourceSummary } from './types'

export function isDeal(edge: number): boolean {
  return edge >= MIN_EDGE
}

/** Biggest edge first — that is the order you want to work down the list in. */
export function sortDeals(deals: DealRow[]): DealRow[] {
  return [...deals].sort((left, right) => right.edge - left.edge || left.ask - right.ask)
}

/** Cheapest first: with no comps to go on, the ask is all there is to judge. */
export function sortNoComps(rows: NoCompsRow[]): NoCompsRow[] {
  return [...rows].sort((left, right) => left.ask - right.ask)
}

/** Group the dropdown by what went wrong so repeated failures read as one problem. */
export function groupProblems(rows: ProblemRow[]): Array<{ reason: string; rows: ProblemRow[] }> {
  const groups = new Map<string, ProblemRow[]>()
  for (const row of rows) {
    const existing = groups.get(row.reason)
    if (existing) {
      existing.push(row)
    } else {
      groups.set(row.reason, [row])
    }
  }
  return [...groups.entries()]
    .map(([reason, grouped]) => ({ reason, rows: grouped }))
    .sort((left, right) => right.rows.length - left.rows.length || left.reason.localeCompare(right.reason))
}

/**
 * Add up what each source contributed.
 *
 * These three are only ever shown as one number, but they are counted per source so a
 * run of one marketplace can replace its own tallies without having to guess at the
 * other's.
 */
export function withTotals(report: DealFinderReport): DealFinderReport {
  return {
    ...report,
    belowEdge: report.sources.reduce((total, source) => total + source.belowEdge, 0),
    outOfScope: report.sources.reduce((total, source) => total + source.outOfScope, 0),
    fromCache: report.sources.reduce((total, source) => total + source.fromCache, 0)
  }
}

/** Newest of two scan times, either of which may be missing on an older report. */
function latest(left: string, right: string): string {
  return (Date.parse(right) || 0) > (Date.parse(left) || 0) ? right : left
}

/**
 * Fold a scan of some sources into the report that is already stored.
 *
 * Marktplaats and Vinted are scanned separately, and each run only knows about its own
 * marketplace — so everything the run just read replaces what was known about those
 * sources, and every row belonging to a source it did not touch is carried over
 * untouched. Running one marketplace therefore never blanks the other's results, which
 * is the whole point of being able to run them apart.
 */
export function mergeReports(previous: DealFinderReport | null, next: DealFinderReport): DealFinderReport {
  if (!isCurrentReport(previous)) {
    return next
  }

  const refreshed = new Set<DealSource>(next.sources.map((source) => source.source))
  const carried = <T extends { source: DealSource }>(rows: T[]): T[] => rows.filter((row) => !refreshed.has(row.source))
  const sources = [...previous.sources.filter((source) => !refreshed.has(source.source)), ...next.sources]

  return withTotals({
    ...next,
    scannedAt: latest(previous.scannedAt, next.scannedAt),
    sources: sources.sort((left, right) => DEAL_SOURCES.indexOf(left.source) - DEAL_SOURCES.indexOf(right.source)),
    deals: sortDeals([...carried(previous.deals), ...next.deals]),
    noComps: sortNoComps([...carried(previous.noComps), ...next.noComps]),
    problems: [...carried(previous.problems), ...next.problems]
  })
}

export function emptyReport(scannedAt: string): DealFinderReport {
  return {
    scannedAt,
    sources: [],
    deals: [],
    noComps: [],
    problems: [],
    belowEdge: 0,
    outOfScope: 0,
    fromCache: 0,
    errors: []
  }
}

/**
 * A report written before the scan counted fees and postage has rows with no `cost` on
 * them, and its edges are measured against the bare ask. Rather than render numbers that
 * flatter every listing, such a report is treated as no report at all: the screen asks
 * for a scan, and the next one writes rows that carry their cost. The same goes for one
 * written before the sources were tallied apart — there is nothing there to merge a
 * single-source run into.
 */
export function isCurrentReport(report: DealFinderReport | null): report is DealFinderReport {
  if (!report) {
    return false
  }
  if (!report.sources.every(hasPerSourceTallies)) {
    return false
  }
  return [...report.deals, ...report.noComps, ...report.problems].every((row) => row.cost != null)
}

/**
 * A summary written before the two marketplaces were scanned apart carries no tallies
 * of its own, so there is no way to fold a fresh run of one source into it.
 */
function hasPerSourceTallies(source: SourceSummary): boolean {
  return (
    Array.isArray(source.notes) &&
    typeof source.scannedAt === 'string' &&
    typeof source.belowEdge === 'number' &&
    typeof source.outOfScope === 'number' &&
    typeof source.fromCache === 'number'
  )
}
