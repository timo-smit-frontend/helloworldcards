export function parseListedPrice(price: string | number | undefined): number | null {
  if (price == null || price === '') {
    return null
  }

  if (typeof price === 'number') {
    return Number.isFinite(price) ? price : null
  }

  const raw = price.replace(/€/g, '').trim()
  if (!raw) {
    return null
  }

  if (raw.includes(',')) {
    const value = Number(raw.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(value) ? value : null
  }

  const parts = raw.split('.')
  const last = parts[parts.length - 1]
  if (parts.length > 1 && last && last.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    const value = Number(parts.join(''))
    return Number.isFinite(value) ? value : null
  }

  const value = Number(raw.replace(/\s/g, ''))
  return Number.isFinite(value) ? value : null
}

export function formatShopPrice(value: number): string {
  return `€${value}`
}

/** Shop listing price minus €0,01 for Marktplaats (psychological pricing). Shop stays clean; MP looks slightly cheaper. */
export function marktplaatsListingEuros(shopPrice: string | number | undefined): number | null {
  const euros = parseListedPrice(shopPrice)
  if (euros == null) {
    return null
  }
  return Math.max(0, euros - 0.01)
}

/** Dutch Vraagprijs field, e.g. `99,99` for a €100 shop price. */
export function formatMarktplaatsVraagprijs(euros: number): string {
  return euros.toFixed(2).replace('.', ',')
}

/** Shop `€100` → Marktplaats `99,99`. Returns null when shop price is missing or invalid. */
export function marktplaatsVraagprijsFromShop(shopPrice: string | number | undefined): string | null {
  const euros = marktplaatsListingEuros(shopPrice)
  return euros == null ? null : formatMarktplaatsVraagprijs(euros)
}

const BID_STEP_EUROS = 5

interface MarktplaatsBidding {
  /**
   * "Bieden vanaf" on the ad form: one €5 step under the floor, minus one cent like the Vraagprijs
   * (e.g. `84.99` for a €100 shop price).
   */
  minimumBid: number
  /** Lowest price we sell at, and the tegenbod to any bid below it — always a round €5 (e.g. `90` for €100). */
  counterOffer: number
}

/**
 * Marktplaats bidding for a shop price. The floor is the shop price minus €5 (under €100) or €10
 * (from €100 up), rounded up to a whole €5. The minimum bid sits one €5 step under that floor, less
 * one cent, so a buyer who bids the minimum gets countered at the floor and the gap is too small to
 * split into another round number. Returns null when the shop price is missing, invalid, or too low
 * to bid on.
 */
export function marktplaatsBiddingFromShop(shopPrice: string | number | undefined): MarktplaatsBidding | null {
  const euros = parseListedPrice(shopPrice)
  if (euros == null || euros <= 0) {
    return null
  }

  const maxDiscount = euros < 100 ? 5 : 10
  const counterOffer = Math.ceil((euros - maxDiscount) / BID_STEP_EUROS) * BID_STEP_EUROS
  const minimumBidStep = counterOffer - BID_STEP_EUROS
  if (minimumBidStep < BID_STEP_EUROS) {
    return null
  }

  return { minimumBid: Math.round((minimumBidStep - 0.01) * 100) / 100, counterOffer }
}

/** Dutch "Bieden vanaf" field, e.g. `84,99` for a €100 shop price. Null when there is nothing to bid on. */
export function marktplaatsBiedenVanafFromShop(shopPrice: string | number | undefined): string | null {
  const bidding = marktplaatsBiddingFromShop(shopPrice)
  return bidding == null ? null : formatMarktplaatsVraagprijs(bidding.minimumBid)
}
