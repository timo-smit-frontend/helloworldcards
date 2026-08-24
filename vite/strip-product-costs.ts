const COST_LINE = /^\s*cost:\s*-?\d+(?:\.\d+)?,?\s*\n/gm

export function stripProductCosts(source: string): string {
  return source.replace(COST_LINE, '')
}
