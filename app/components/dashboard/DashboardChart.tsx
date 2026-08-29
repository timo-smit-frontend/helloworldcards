import { useMemo } from 'react'
import { soldItemsForPeriod, summarizeLedger } from '~/database/ledger'
import type { Ledger, LedgerItem, LedgerPeriod } from '~/database/ledger-types'

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

function formatPercent(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    maximumFractionDigits: 0
  }).format(value)
}

function formatSoldDate(iso: string | null): string {
  if (!iso) return 'Date unknown'
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return 'Date unknown'
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function moneyTone(value: number): string {
  if (value > 0) return 'text-site-envy'
  if (value < 0) return 'text-site-loss'
  return 'text-site-gray-nurse'
}

export function PeriodToggle({ period, onChange }: { period: LedgerPeriod; onChange: (period: LedgerPeriod) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Period"
      className="inline-flex rounded-full bg-site-mid p-1 ring-1 ring-site-mulled-wine"
    >
      {(
        [
          ['all', 'All time'],
          ['month', 'This month']
        ] as const
      ).map(([value, label]) => {
        const selected = period === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(value)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold smooth ${
              selected ? 'bg-site-gunmetal text-site-gray-nurse' : 'text-site-mantle'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">{label}</dt>
      <dd className={`text-xl font-semibold tabular-nums sm:text-2xl ${tone ?? 'text-site-gray-nurse'}`}>{value}</dd>
    </div>
  )
}

function SoldRow({ item }: { item: LedgerItem }) {
  const profit = item.spending != null && item.listed != null ? item.listed - item.spending : null

  return (
    <li className="grid gap-1 py-4 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-6">
      <p className="text-sm tabular-nums text-site-mantle">{formatSoldDate(item.soldAt)}</p>
      <p className="min-w-0 truncate font-semibold text-site-gray-nurse">{item.title}</p>
      <p className="text-sm tabular-nums text-site-mantle">
        {item.listed == null ? 'No listed price' : formatEuros(item.listed)}
        {' · '}
        {profit == null ? 'No cost' : formatSignedEuros(profit)}
      </p>
    </li>
  )
}

export default function DashboardChart({ ledger, period }: { ledger: Ledger; period: LedgerPeriod }) {
  const totals = useMemo(() => summarizeLedger(ledger.items, period), [ledger.items, period])
  const soldItems = useMemo(() => soldItemsForPeriod(ledger.items, period), [ledger.items, period])

  return (
    <div className="flex flex-col gap-12 lg:gap-16">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          {`Spent ${formatEuros(totals.spent)}, sold ${formatEuros(totals.sold)}, potential ${formatEuros(totals.potential)}.`}
        </caption>
        <thead className="sr-only sm:not-sr-only">
          <tr className="sm:border-b sm:border-site-mulled-wine">
            <th scope="col" className="w-1/3 py-3 pr-4 text-xs font-semibold tracking-[0.22em] text-site-foil uppercase">
              Spent
            </th>
            <th scope="col" className="w-1/3 py-3 px-4 text-xs font-semibold tracking-[0.22em] text-site-envy uppercase">
              Sold
            </th>
            <th scope="col" className="w-1/3 py-3 pl-4 text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">
              Potential
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="flex flex-col gap-8 border-b border-site-mulled-wine py-6 sm:table-row sm:gap-0 sm:py-0">
            <td className="align-bottom sm:py-6 sm:pr-4">
              <p className="mb-2 text-xs font-semibold tracking-[0.22em] text-site-foil uppercase sm:hidden">Spent</p>
              <p className="font-semibold tabular-nums text-4xl tracking-[-0.04em] text-site-foil sm:text-5xl lg:text-6xl">
                {formatEuros(totals.spent)}
              </p>
              <p className="mt-2 text-sm text-site-mantle">What you paid</p>
            </td>
            <td className="align-bottom sm:py-6 sm:px-4">
              <p className="mb-2 text-xs font-semibold tracking-[0.22em] text-site-envy uppercase sm:hidden">Sold</p>
              <p className="font-semibold tabular-nums text-4xl tracking-[-0.04em] text-site-envy sm:text-5xl lg:text-6xl">
                {formatEuros(totals.sold)}
              </p>
              <p className="mt-2 text-sm text-site-mantle">Taken in</p>
            </td>
            <td className="align-bottom sm:py-6 sm:pl-4">
              <p className="mb-2 text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase sm:hidden">Potential</p>
              <p className="font-semibold tabular-nums text-4xl tracking-[-0.04em] text-site-gray-nurse sm:text-5xl lg:text-6xl">
                {formatEuros(totals.potential)}
              </p>
              <p className="mt-2 text-sm text-site-mantle">Still listed</p>
            </td>
          </tr>
        </tbody>
      </table>

      <dl className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        <Stat label="Sold" value={`${totals.cardsSold}`} />
        <Stat label="In stock" value={`${totals.cardsInStock}`} />
        <Stat
          label="Realized"
          value={`${formatSignedEuros(totals.realizedProfit)} / ${formatPercent(totals.realizedMargin)}`}
          tone={moneyTone(totals.realizedProfit)}
        />
        <Stat
          label="If stock sells"
          value={`${formatSignedEuros(totals.potentialProfit)} / ${formatPercent(totals.potentialMargin)}`}
          tone={moneyTone(totals.potentialProfit)}
        />
      </dl>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">Recently sold</h2>
        {soldItems.length === 0 ? (
          <p className="content-m text-site-mantle">
            {period === 'month' ? 'No cards sold this month.' : 'No sales on the books yet.'}
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine p-0">
            {soldItems.map((item) => (
              <SoldRow key={item.id} item={item} />
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
