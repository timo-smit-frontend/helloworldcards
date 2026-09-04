export function formatEuros(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(value)
}

export function formatSignedEuros(value: number): string {
  const formatted = formatEuros(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `−${formatted}`
  return formatted
}

/** Prices are always rounded up, so a listed figure never reads cheaper than it is. */
export function formatListedEuros(value: number): string {
  return formatEuros(Math.ceil(value))
}

export function moneyTone(value: number): string {
  if (value > 0) return 'text-site-envy'
  if (value < 0) return 'text-site-loss'
  return 'text-site-gray-nurse'
}
