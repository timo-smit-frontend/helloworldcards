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
