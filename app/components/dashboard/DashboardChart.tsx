import { useMemo } from 'react'
import { RotateCw } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import Image from '~/components/elements/Image'
import { soldItemsForPeriod, summarizeLedger } from '~/database/ledger'
import type { Ledger, LedgerItem, LedgerPeriod } from '~/database/ledger-types'
import type { MarketListing } from '~/services/cardmarket/grades'
import type { CardmarketProductReport, CardmarketReport } from '~/services/cardmarket/scan'
import PriceFigure from './PriceFigure'
import { formatEuros, formatListedEuros, formatSignedEuros, moneyTone } from './money'

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

/** Competitors shown per card — the cheapest few are the ones a price is judged against. */
const SHOWN_COMPETITORS = 5

/** The scan's stored error strings, said the way a person would. */
function friendlyError(error: string): string {
  if (/blocked|challenge/i.test(error)) return 'Cardmarket blocked this scan — try again in a bit.'
  if (/no cardmarket listings/i.test(error)) return 'Cardmarket showed no offers — the card link may be wrong.'
  return `The scan failed: ${error}`
}

/** One line on where this card stands, so a row without a price change still tells you something. */
function marketStatus(item: CardmarketProductReport, competing: MarketListing[], similar: MarketListing[]): string | null {
  if (item.error) return friendlyError(item.error)
  if (item.listings.length === 0) return 'No competing slabs currently.'
  if (competing.length === 0 && similar.length === 0) return 'No competing slabs currently.'
  // Anything else the offer rows say themselves: the grade is in every row's comment,
  // and a price sitting even with the cheapest one is plain from the numbers.
  return null
}

/**
 * Reading order: cards being undercut first, then ones priced under the market, then
 * ones sitting even with it, and last the ones with nothing to compare against.
 */
function rowRank(item: CardmarketProductReport): number {
  if (item.suggestion?.direction === 'down') return 0
  if (item.suggestion?.direction === 'up') return 1
  if (!item.error && (item.competitors?.length || item.similar?.length || item.listings.length)) return 2
  return 3
}

function SuggestionRow({ item }: { item: CardmarketProductReport }) {
  const suggestion = item.suggestion
  const delta = suggestion ? suggestion.target - item.listed : null
  // Every offer at this grade or better, not just the ones the suggested price came
  // from — a PSA 10 sitting under your PSA 9 is why a price is wrong, so it has to show.
  // A report saved before the scan collected those falls back to what it did save.
  const competing = item.competitors?.length ? item.competitors : (suggestion?.basis ?? [])
  // Nothing at this grade or better still leaves the lower grades as a read on the market.
  const similar = competing.length === 0 ? (item.similar ?? []) : []
  const status = marketStatus(item, competing, similar)
  const listings = [
    // The scan reads the whole offer list, but only the cheapest few are worth reading:
    // they are already sorted, so this is the top of the list rather than an arbitrary cut.
    ...(competing.length > 0 ? competing : similar)
      .slice(0, SHOWN_COMPETITORS)
      .map((listing) => ({ listing, suffix: undefined as string | undefined })),
    ...item.gone.map((listing) => ({ listing, suffix: 'gone' }))
  ]
  const notes = suggestion?.notes ?? []
  // The floor is the price to know even when it is yours; the suggestion only exists when it is not.
  const marketPrice = suggestion?.target ?? item.floor ?? null

  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        title="Open on Cardmarket"
        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4 no-underline smooth hover:opacity-80 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6"
      >
        <div className="relative h-36 w-24 shrink-0">
          {item.image ? (
            <Image
              src={item.image}
              alt=""
              title=""
              width={192}
              height={288}
              maxwidth={400}
              sizes="96px"
              aria-hidden
              className="absolute inset-0 size-full object-contain"
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-site-gray-nurse">{item.title}</p>
          {status ? <p className="mt-1 text-sm text-site-mantle">{status}</p> : null}
          {listings.length > 0 || notes.length > 0 ? (
            <ul className="mt-1 grid w-max grid-cols-[--spacing(16)_--spacing(36)_--spacing(16)_--spacing(16)] gap-x-3 gap-y-0.5 text-sm text-site-mantle">
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
            label={suggestion ? 'Suggested' : 'Floor'}
            value={marketPrice != null ? formatListedEuros(marketPrice) : '—'}
            tone={delta == null || delta === 0 ? undefined : moneyTone(delta)}
          />
        </div>
      </a>
    </li>
  )
}

export function PriceSuggestions({
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
  // Every scanned card, not just the ones whose price should move: the page is for
  // seeing what the competition is doing, and a price that is already right still has one.
  const rows = [...(report?.products ?? [])].sort((left, right) => rowRank(left) - rowRank(right))

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
          {report ? 'No cards with a Cardmarket link to scan.' : 'Scan Cardmarket to see what the competition is doing.'}
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
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-6">
      <div className="relative h-24 w-16 shrink-0">
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            title=""
            width={128}
            height={192}
            maxwidth={400}
            sizes="64px"
            aria-hidden
            className="absolute inset-0 size-full object-contain"
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-semibold text-site-gray-nurse">{item.title}</span>
          {item.reserved ? (
            <span className="shrink-0 rounded-full border border-site-foil/50 bg-site-foil/15 px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.18em] text-site-foil uppercase">
              Reserved
            </span>
          ) : null}
        </p>
        {item.subtitle ? <p className="mt-0.5 truncate text-sm text-site-mantle">{item.subtitle}</p> : null}
        <p className="mt-1 text-sm tabular-nums text-site-mantle sm:hidden">{formatSoldDate(item.soldAt)}</p>
      </div>
      <p className="hidden text-sm tabular-nums text-site-mantle sm:block">{formatSoldDate(item.soldAt)}</p>
      <div className="col-span-2 flex items-baseline justify-between gap-4 sm:col-span-1 sm:w-28 sm:flex-col sm:items-end sm:gap-0.5">
        <p className="font-semibold tabular-nums text-site-envy">{item.listed == null ? 'No price' : formatEuros(item.listed)}</p>
        <p className={`text-sm tabular-nums ${profit == null ? 'text-site-mantle' : moneyTone(profit)}`}>
          {profit == null ? 'No cost' : formatSignedEuros(profit)}
        </p>
      </div>
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
