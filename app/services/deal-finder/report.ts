import { MIN_EDGE } from './constants'
import type { DealFinderReport, DealRow, NoCompsRow, ProblemRow } from './types'

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
 * for a scan, and the next one writes rows that carry their cost.
 */
export function isCurrentReport(report: DealFinderReport | null): boolean {
  if (!report) {
    return false
  }
  return [...report.deals, ...report.noComps, ...report.problems].every((row) => row.cost != null)
}
