import type { Ledger } from '~/database/ledger-types'

function formatEuros(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(value)
}

function formatSignedEuros(value: number): string {
  const formatted = formatEuros(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `−${formatted}`
  return formatted
}

export default function TillChart({ ledger }: { ledger: Ledger }) {
  const scale = Math.max(ledger.spending, Math.abs(ledger.potentialGain), 1)
  const spentWidth = (ledger.spending / scale) * 100
  const gainWidth = (Math.abs(ledger.potentialGain) / scale) * 100
  const gainPositive = ledger.potentialGain >= 0

  return (
    <figure className="flex flex-col gap-10">
      <div className="grid gap-8 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div className="flex flex-col gap-1 sm:items-end sm:text-right">
          <p className="text-xs font-semibold tracking-[0.22em] text-site-foil uppercase">What you paid</p>
          <p className="font-semibold tabular-nums text-5xl tracking-[-0.04em] text-site-foil sm:text-6xl">
            {formatEuros(ledger.spending)}
          </p>
        </div>
        <div className="hidden h-16 w-px bg-site-mulled-wine sm:block" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-[0.22em] text-site-envy uppercase">If the stock sells</p>
          <p
            className={`font-semibold tabular-nums text-5xl tracking-[-0.04em] sm:text-6xl ${gainPositive ? 'text-site-envy' : 'text-site-loss'}`}
          >
            {formatSignedEuros(ledger.potentialGain)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox="0 0 800 220" className="h-auto w-full min-w-72" role="img" aria-labelledby="till-chart-title till-chart-desc">
          <title id="till-chart-title">Spendings against potential gain</title>
          <desc id="till-chart-desc">
            {`You paid ${formatEuros(ledger.spending)} for current stock. If it all sells at the listed prices, the potential gain is ${formatSignedEuros(ledger.potentialGain)}.`}
          </desc>
          <rect x="0" y="28" width="800" height="164" rx="18" className="fill-site-mid" />
          <line x1="400" y1="44" x2="400" y2="176" className="stroke-site-mulled-wine" strokeWidth="2" />
          <circle cx="400" cy="110" r="5" className="fill-site-gray-nurse" />
          <text x="380" y="70" textAnchor="end" className="fill-site-mantle text-[13px]">
            Paid
          </text>
          <text x="420" y="70" className="fill-site-mantle text-[13px]">
            Gain
          </text>
          <rect x={400 - spentWidth * 3.2} y="92" width={spentWidth * 3.2} height="36" rx="4" className="fill-site-foil" />
          <rect x="400" y="92" width={gainWidth * 3.2} height="36" rx="4" className={gainPositive ? 'fill-site-envy' : 'fill-site-loss'} />
          <text x="380" y="158" textAnchor="end" className="fill-site-foil text-[15px] tabular-nums">
            {formatEuros(ledger.spending)}
          </text>
          <text x="420" y="158" className={`${gainPositive ? 'fill-site-envy' : 'fill-site-loss'} text-[15px] tabular-nums`}>
            {formatSignedEuros(ledger.potentialGain)}
          </text>
        </svg>
      </div>

      <figcaption className="sr-only">
        Spendings {formatEuros(ledger.spending)}. Potential gain {formatSignedEuros(ledger.potentialGain)}.
      </figcaption>

      <ul className="flex flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine">
        {ledger.items.map((item) => {
          const itemScale = Math.max(item.spending ?? 0, Math.abs(item.potentialGain ?? 0), 1)
          const paid = item.spending == null ? 0 : (item.spending / itemScale) * 100
          const gain = item.potentialGain == null ? 0 : (Math.abs(item.potentialGain) / itemScale) * 100
          const itemGainPositive = (item.potentialGain ?? 0) >= 0

          return (
            <li key={item.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold text-site-gray-nurse">{item.title}</p>
                <p className="text-sm tabular-nums text-site-mantle">
                  {item.spending == null ? 'No cost yet' : formatEuros(item.spending)}
                  {' · '}
                  {item.potentialGain == null ? 'No listed price' : formatSignedEuros(item.potentialGain)}
                </p>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-site-mid" aria-hidden>
                <span className="flex w-1/2 justify-end bg-transparent">
                  <span className="h-full rounded-l-full bg-site-foil" style={{ width: `${paid}%` }} />
                </span>
                <span className="flex w-1/2 bg-transparent">
                  <span
                    className={`h-full rounded-r-full ${itemGainPositive ? 'bg-site-envy' : 'bg-site-loss'}`}
                    style={{ width: `${gain}%` }}
                  />
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
