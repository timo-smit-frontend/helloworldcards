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
const SLAB_START = /^(PSA|BGS|Beckett)\s+(\d+(?:\.\d+)?)\b/i
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
  const anchors = listings.filter((item) => item.grader === grader && item.grade === grade)
  if (anchors.length === 0) {
    return null
  }

  const floor = Math.min(...anchors.map((item) => item.price))
  const basis = listings.filter((item) => (item.grader === grader && item.grade === grade) || inCluster(item.price, floor))
  const target = Math.min(...basis.map((item) => item.price))

  const notes = listings
    .filter((item) => item.grade > grade && item.price < listed && !inCluster(item.price, floor))
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
