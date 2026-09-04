import { RotateCw } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import Image from '~/components/elements/Image'
import { MIN_EDGE } from '~/services/deal-finder/constants'
import { groupProblems } from '~/services/deal-finder/report'
import type { DealFinderReport, DealRow, NoCompsRow, ProblemRow } from '~/services/deal-finder/types'
import PriceFigure from './PriceFigure'
import { formatListedEuros, formatSignedEuros } from './money'

function sourceLabel(source: 'marktplaats' | 'vinted'): string {
  return source === 'marktplaats' ? 'Marktplaats' : 'Vinted'
}

function Thumbnail({ src }: { src: string | null }) {
  return (
    <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-site-mid ring-1 ring-site-mulled-wine">
      {src ? (
        <Image
          src={src}
          alt=""
          title=""
          width={160}
          height={160}
          sizes="80px"
          aria-hidden
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </div>
  )
}

/** Where the card came from — the label, PSA's records, or just the seller's words. */
function evidence(row: DealRow | NoCompsRow): string {
  const parts: string[] = [sourceLabel(row.source)]
  if (row.card.signals.includes('psa-cert')) {
    parts.push('PSA cert lookup')
  } else if (row.card.signals.includes('psa-label')) {
    parts.push('read off the slab')
  } else {
    parts.push('from the listing text')
  }
  if (row.card.certNumber) {
    parts.push(`cert ${row.card.certNumber}`)
  }
  return parts.join(' · ')
}

function DealListRow({ item }: { item: DealRow }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <Thumbnail src={item.imageUrl} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-site-gray-nurse">{item.displayTitle}</p>
        <p className="mt-1 truncate text-sm text-site-mantle">{evidence(item)}</p>
      </div>
      <div className="col-span-2 flex justify-end gap-5 sm:col-span-1 sm:gap-8">
        <PriceFigure label="Asking price" value={formatListedEuros(item.ask)} href={item.listingUrl} />
        <PriceFigure label="Lowest listed" value={formatListedEuros(item.marketFloor)} href={item.cardmarketUrl} />
        <PriceFigure label="Edge" value={formatSignedEuros(item.edge)} tone="text-site-envy" />
      </div>
    </li>
  )
}

function NoCompsListRow({ item }: { item: NoCompsRow }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <Thumbnail src={item.imageUrl} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-site-gray-nurse">{item.displayTitle}</p>
        <p className="mt-1 truncate text-sm text-site-foil">{item.reason}</p>
        <p className="mt-1 truncate text-sm text-site-mantle">{evidence(item)}</p>
      </div>
      <div className="col-span-2 flex justify-end gap-5 sm:col-span-1 sm:gap-8">
        <PriceFigure label="Asking price" value={formatListedEuros(item.ask)} href={item.listingUrl} />
        {item.cardmarketUrl ? <PriceFigure label="Cardmarket" value="Open" href={item.cardmarketUrl} /> : null}
      </div>
    </li>
  )
}

function ProblemListRow({ item }: { item: ProblemRow }) {
  return (
    <li className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-6">
      <div className="min-w-0">
        <a
          href={item.listingUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-semibold text-site-gray-nurse underline decoration-site-mantle/40 underline-offset-2 smooth hover:decoration-site-gray-nurse"
        >
          {item.title}
        </a>
        <p className="mt-1 text-xs text-site-mantle">
          {sourceLabel(item.source)}
          {item.detail ? ` · ${item.detail}` : ''}
        </p>
        {item.query ? (
          <p className="mt-1 truncate font-mono text-xs text-site-mantle/80" title={item.query}>
            {item.query}
          </p>
        ) : null}
        {item.googleUrl || item.cardmarketUrl ? (
          <p className="mt-1 text-xs text-site-mantle">
            {item.googleUrl ? (
              <a href={item.googleUrl} target="_blank" rel="noreferrer" className="underline smooth hover:text-site-gray-nurse">
                Google
              </a>
            ) : null}
            {item.googleUrl && item.cardmarketUrl ? ' · ' : null}
            {item.cardmarketUrl ? (
              <a href={item.cardmarketUrl} target="_blank" rel="noreferrer" className="underline smooth hover:text-site-gray-nurse">
                Cardmarket
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
      <p className="text-sm tabular-nums text-site-mantle">{formatListedEuros(item.ask)}</p>
    </li>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">{children}</h3>
}

function scanSummary(report: DealFinderReport): string | null {
  const parts: string[] = []
  if (report.belowEdge > 0) {
    parts.push(`${report.belowEdge} priced under a €${MIN_EDGE} edge`)
  }
  if (report.outOfScope > 0) {
    parts.push(`${report.outOfScope} not a PSA 9/10 single we buy`)
  }
  if (report.fromCache > 0) {
    parts.push(`${report.fromCache} reused from the last scan`)
  }
  return parts.length > 0 ? `${parts.join(' · ')}.` : null
}

export default function DealFinder({
  report,
  scanning,
  scanError,
  onScan
}: {
  report: DealFinderReport | null
  scanning: boolean
  scanError: string | null
  onScan: () => void
}) {
  const deals = report?.deals ?? []
  const noComps = report?.noComps ?? []
  const problems = groupProblems(report?.problems ?? [])
  const problemCount = report?.problems.length ?? 0
  const sourceErrors = (report?.sources ?? []).map((source) => source.error).filter((error): error is string => Boolean(error))
  const summary = report ? scanSummary(report) : null

  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">Deal finder</h2>
        <button
          type="button"
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-site-mantle smooth hover:bg-site-mid hover:text-site-gray-nurse disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={scanning ? 'Scanning for deals' : 'Scan Marktplaats and Vinted'}
          onClick={onScan}
          disabled={scanning}
        >
          <MorphIcon icon={RotateCw} size={18} strokeWidth={2.25} className={scanning ? 'animate-spin' : undefined} />
        </button>
      </div>

      {scanError ? <p className="content-m text-site-loss">{scanError}</p> : null}
      {[...(report?.errors ?? []), ...sourceErrors].map((error) => (
        <p key={error} className="content-m text-site-loss">
          {error}
        </p>
      ))}

      {scanning && deals.length === 0 ? (
        <p className="content-m text-site-mantle">Reading listings, slab labels and Cardmarket…</p>
      ) : deals.length === 0 ? (
        <p className="content-m text-site-mantle">
          {report
            ? `Nothing on Marktplaats or Vinted is €${MIN_EDGE} under the Cardmarket floor right now.`
            : 'Scan Marktplaats and Vinted for PSA 9 and 10 cards priced below Cardmarket.'}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine p-0">
          {deals.map((item) => (
            <DealListRow key={item.id} item={item} />
          ))}
        </ol>
      )}

      {noComps.length > 0 ? (
        <div className="flex flex-col gap-3">
          <SectionHeading>No Cardmarket price ({noComps.length})</SectionHeading>
          <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine p-0">
            {noComps.map((item) => (
              <NoCompsListRow key={item.id} item={item} />
            ))}
          </ol>
        </div>
      ) : null}

      {summary ? <p className="content-m text-site-mantle">{summary}</p> : null}

      {problemCount > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">
            Could not check ({problemCount})
          </summary>
          <div className="mt-4 flex flex-col gap-6">
            {problems.map((group) => (
              <div key={group.reason} className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-site-foil">
                  {group.reason} ({group.rows.length})
                </p>
                <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine p-0">
                  {group.rows.map((item) => (
                    <ProblemListRow key={item.id} item={item} />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}
