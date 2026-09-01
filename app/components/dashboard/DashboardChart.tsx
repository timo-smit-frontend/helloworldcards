import { useMemo } from 'react'
import { RotateCw } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import Image from '~/components/elements/Image'
import { soldItemsForPeriod, summarizeLedger } from '~/database/ledger'
import type { Ledger, LedgerItem, LedgerPeriod } from '~/database/ledger-types'
import type { CardmarketProductReport, CardmarketReport } from '~/services/cardmarket/scan'

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
    <div role="radiogroup" aria-label="Period" className="inline-flex rounded-full bg-site-mid p-1 ring-1 ring-site-mulled-wine">
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

function formatListedEuros(value: number): string {
  return formatEuros(Math.ceil(value))
}

function PriceFigure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-16 flex-col items-end gap-1 text-right">
      <p className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">{label}</p>
      <p className={`font-semibold tabular-nums tracking-[-0.03em] ${tone ?? 'text-site-gray-nurse'}`}>{value}</p>
    </div>
  )
}

function SuggestionRow({ item }: { item: CardmarketProductReport }) {
  const suggestion = item.suggestion
  const delta = suggestion ? suggestion.target - item.listed : null
  const listings = [
    ...(suggestion?.basis.map((listing) => ({ listing, suffix: undefined as string | undefined })) ?? []),
    ...item.gone.map((listing) => ({ listing, suffix: 'gone' }))
  ]
  const notes = [...(suggestion?.notes ?? []), ...(item.error ? [item.error] : [])]

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="relative size-36 shrink-0 overflow-hidden rounded-md bg-site-mid ring-1 ring-site-mulled-wine">
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            title=""
            width={288}
            height={288}
            maxwidth={400}
            sizes="144px"
            aria-hidden
            className="absolute inset-0 size-full object-contain p-1.5"
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-site-gray-nurse">{item.title}</p>
        {listings.length > 0 || notes.length > 0 ? (
          <ul className="mt-1 grid w-max grid-cols-[--spacing(14)_--spacing(36)_--spacing(14)_--spacing(14)] gap-x-3 gap-y-0.5 text-sm text-site-mantle">
            {listings.map(({ listing, suffix }) => {
              const vsListed = listing.price - item.listed
              return (
                <li key={`${listing.id}-${suffix ?? 'live'}`} className="col-span-full grid grid-cols-subgrid">
                  <span className="min-w-0 truncate">{listing.comment}</span>
                  <span className="min-w-0 truncate">
                    {listing.seller}
                    {suffix ? ` ${suffix}` : null}
                  </span>
                  <span className="min-w-0 truncate tabular-nums">{formatListedEuros(listing.price)}</span>
                  <span className={`min-w-0 truncate tabular-nums font-semibold ${vsListed === 0 ? '' : moneyTone(vsListed)}`}>
                    {vsListed === 0 ? '' : formatSignedEuros(vsListed)}
                  </span>
                </li>
              )
            })}
            {notes.map((line) => (
              <li key={line} className="col-span-full truncate">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="col-span-2 flex justify-end gap-5 sm:col-span-1 sm:gap-8">
        <PriceFigure label="Current" value={formatListedEuros(item.listed)} />
        <PriceFigure
          label="Suggested"
          value={suggestion ? formatListedEuros(suggestion.target) : '—'}
          tone={delta == null || delta === 0 ? undefined : moneyTone(delta)}
        />
      </div>
    </li>
  )
}

function PriceSuggestions({
  report,
  scanning,
  scanError,
  onScan
}: {
  report: CardmarketReport | null
  scanning: boolean
  scanError: string | null
  onScan: () => void
}) {
  const rows = (report?.products ?? []).filter((product) => product.suggestion != null || product.error != null || product.gone.length > 0)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">Price suggestions</h2>
        <button
          type="button"
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-site-mantle smooth hover:bg-site-mid hover:text-site-gray-nurse disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={scanning ? 'Scanning Cardmarket' : 'Scan Cardmarket'}
          onClick={onScan}
          disabled={scanning}
        >
          <MorphIcon icon={RotateCw} size={18} strokeWidth={2.25} className={scanning ? 'animate-spin' : undefined} />
        </button>
      </div>
      {scanError ? <p className="content-m text-site-loss">{scanError}</p> : null}
      {scanning && rows.length === 0 ? (
        <p className="content-m text-site-mantle">Scanning Cardmarket…</p>
      ) : rows.length === 0 ? (
        <p className="content-m text-site-mantle">
          {report ? 'Prices are even with the lowest same-grade listing.' : 'Scan Cardmarket to see which prices should go up or down.'}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine p-0">
          {rows.map((item) => (
            <SuggestionRow key={item.id} item={item} />
          ))}
        </ol>
      )}
    </section>
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

export default function DashboardChart({
  ledger,
  period,
  report = null,
  scanning = false,
  scanError = null,
  onScan
}: {
  ledger: Ledger
  period: LedgerPeriod
  report?: CardmarketReport | null
  scanning?: boolean
  scanError?: string | null
  onScan?: () => void
}) {
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

      {import.meta.env.DEV && onScan ? (
        <PriceSuggestions report={report} scanning={scanning} scanError={scanError} onScan={onScan} />
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">Recently sold</h2>
        {soldItems.length === 0 ? (
          <p className="content-m text-site-mantle">{period === 'month' ? 'No cards sold this month.' : 'No sales on the books yet.'}</p>
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
