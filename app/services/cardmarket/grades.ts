import type { CardGrader } from '../../database/products'

export type MarketListing = {
  id: string
  seller: string
  comment: string
  grader: CardGrader
  grade: number
  price: number
}

export type PriceSuggestion = {
  direction: 'up' | 'down'
  target: number
  basis: MarketListing[]
  notes: string[]
}

const CLUSTER = 0.15
/** Sellers often write `Psa9` / `PSA9` without a space. */
const SLAB_START = /^(PSA|BGS|Beckett)\s*(\d+(?:\.\d+)?)\b/i
const NOT_A_SLAB = /\bcontender\b|\bwould be\b|\blooks like\b|\bcould be\b|\bcandidate\b|\bnot a\s+(psa|bgs)\b|^\s*no\s+(psa|bgs)\b/i

export function parseSlabComment(comment: string): { grader: CardGrader; grade: number } | null {
  const text = comment.trim()
  if (!text || NOT_A_SLAB.test(text)) {
    return null
  }

  const match = text.match(SLAB_START)
  if (!match) {
    return null
  }

  const label = match[1].toLowerCase()
  const grade = Number(match[2])
  if (!Number.isFinite(grade)) {
    return null
  }

  return {
    grader: label === 'psa' ? 'psa' : 'beckett',
    grade
  }
}

function inCluster(price: number, floor: number): boolean {
  if (floor <= 0) {
    return false
  }

  return Math.abs(price - floor) / floor <= CLUSTER
}

function formatEuro(value: number): string {
  return `€${value}`
}

function graderLabel(grader: CardGrader): string {
  return grader === 'psa' ? 'PSA' : 'BGS'
}

export function marketFloorPrice({
  grader,
  grade,
  listings
}: {
  grader: CardGrader
  grade: number
  listings: MarketListing[]
}): { floor: number; basis: MarketListing[] } | null {
  const anchors = listings.filter((item) => item.grader === grader && item.grade === grade)
  if (anchors.length === 0) {
    return null
  }

  const floor = Math.min(...anchors.map((item) => item.price))
  // A nearby price only counts from your grade up to one above: a PSA 8 is not what a PSA 9
  // is judged against, however close its price sits.
  const basis = listings.filter(
    (item) =>
      (item.grader === grader && item.grade === grade) ||
      (item.grade >= grade && item.grade <= grade + 1 && inCluster(item.price, floor))
  )
  return {
    floor: Math.min(...basis.map((item) => item.price)),
    basis
  }
}

export function suggestListedPrice({
  grader,
  grade,
  listed,
  listings
}: {
  grader: CardGrader
  grade: number
  listed: number
  listings: MarketListing[]
}): PriceSuggestion | null {
  const market = marketFloorPrice({ grader, grade, listings })
  if (!market) {
    return null
  }

  const target = market.floor
  const basis = market.basis

  const notes = listings
    .filter((item) => item.grade > grade && item.price < listed && !inCluster(item.price, market.floor))
    .map((item) => `${graderLabel(item.grader)} ${item.grade} from ${item.seller} at ${formatEuro(item.price)} is below your price`)

  if (target === listed) {
    return null
  }

  return {
    direction: target < listed ? 'down' : 'up',
    target,
    basis,
    notes
  }
}

/**
 * Every offer at your grade or better, cheapest first.
 *
 * These are the ones that actually compete with yours: a buyer choosing between your
 * PSA 9 and someone else's PSA 10 at the same money is not going to choose yours. A
 * lower grade undercutting you is a different card to them, so it is left out.
 */
export function sameOrBetterGrade({ grade, listings }: { grade: number; listings: MarketListing[] }): MarketListing[] {
  return listings.filter((item) => item.grade >= grade).sort((left, right) => left.price - right.price)
}

/**
 * What is on offer when nobody lists your grade or better: the lower grades, closest to
 * yours first and cheapest within a grade. Not competition, but still the only read on
 * the market a BGS 9.5 next to a page of PSA 9s is going to get.
 */
export function nearestLowerGrades({ grade, listings }: { grade: number; listings: MarketListing[] }): MarketListing[] {
  return listings.filter((item) => item.grade < grade).sort((left, right) => right.grade - left.grade || left.price - right.price)
}

/**
 * The few offers worth reading under a card: the ones priced closest to yours, shown
 * cheapest first. The offer a suggested price came from always makes the cut, however
 * far from yours it sits, so the number the suggestion names is on screen.
 */
export function closestOffers({
  listed,
  offers,
  target,
  count
}: {
  listed: number
  offers: MarketListing[]
  target?: MarketListing
  count: number
}): MarketListing[] {
  const rest = offers
    .filter((item) => item.id !== target?.id)
    .sort((left, right) => Math.abs(left.price - listed) - Math.abs(right.price - listed) || left.price - right.price)
  return [...(target ? [target] : []), ...rest].slice(0, count).sort((left, right) => left.price - right.price)
}
