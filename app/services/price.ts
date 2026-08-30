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
