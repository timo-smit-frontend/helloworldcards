const CARD_FRACTION = /^(\d{1,3})\/(\d{1,3})$/

/** PSA / listing fraction: 015/113 → card 015, set size 113. Promo codes (SM211) pass through. */
export function parseListingCardNumber(raw: string | null | undefined): string | null {
  if (!raw) {
    return null
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  const fraction = trimmed.match(CARD_FRACTION)
  if (fraction) {
    return fraction[1]!
  }

  return trimmed
}

/** Set size from a listing fraction, e.g. 015/113 → 113. */
export function parseSetSizeFromFraction(raw: string | null | undefined): number | null {
  if (!raw) {
    return null
  }

  const fraction = raw.trim().match(CARD_FRACTION)
  if (!fraction) {
    return null
  }

  return Number(fraction[2])
}
