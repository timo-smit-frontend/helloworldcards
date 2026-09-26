import { RotateCw } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import { DEAL_SOURCES, MIN_EDGE } from '~/services/deal-finder/constants'
import { POPULAR_STAR, splitStar } from '~/services/deal-finder/popular'
import { groupProblems } from '~/services/deal-finder/report'
import type { DealFinderReport, DealRow, DealSource, NoCompsRow, ProblemRow } from '~/services/deal-finder/types'
import { CARD_ROW, CardThumbnail, FigureStrip } from './CardRow'
import PriceFigure from './PriceFigure'
import { formatListedEuros, formatSignedEuros } from './money'

export function sourceLabel(source: DealSource): string {
  return source === 'marktplaats' ? 'Marktplaats' : 'Vinted'
}

/** Whether any marketplace is mid-scan — the two run on their own. */
export type ScanningSources = Record<DealSource, boolean>

/**
 * One scan button per marketplace.
 *
 * A scan takes minutes and can be stopped in its tracks by a bot check that needs
 * clearing by hand, so each marketplace is started on its own and spins on its own
 * button — which is also how you can tell which of the two is still going.
 */
function ScanButton({ source, scanning, onScan }: { source: DealSource; scanning: boolean; onScan: (source: DealSource) => void }) {
  return (
    <button
      type="button"
      className="button-quiet w-fit! gap-2 disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={scanning ? `Scanning ${sourceLabel(source)}` : `Scan ${sourceLabel(source)}`}
      aria-busy={scanning}
      onClick={() => onScan(source)}
      disabled={scanning}
    >
      <MorphIcon icon={RotateCw} size={16} strokeWidth={2.25} className={scanning ? 'animate-spin' : undefined} />
      {sourceLabel(source)}
    </button>
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

/**
 * The card, with its popular-character star on its own line above the name.
 *
 * Sitting over the title rather than in front of it keeps the mark out of the truncated
 * text — a long card name can never push it off the end — and leaves every title in the
 * column starting at the same place, which is what makes a starred row findable by
 * running your eye down the list.
 */
function DealTitle({ title }: { title: string }) {
  const { starred, title: name } = splitStar(title)
  return (
    <>
      {starred ? (
        <p className="mb-1 text-sm leading-none text-site-foil" title="Popular character">
          {POPULAR_STAR}
        </p>
      ) : null}
      <p className="truncate font-semibold text-site-gray-nurse">{name}</p>
    </>
  )
}

function DealListRow({ item }: { item: DealRow }) {
  return (
    <li className={`${CARD_ROW} md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-x-6`}>
      <CardThumbnail src={item.imageUrl} />
      <div className="min-w-0">
        <DealTitle title={item.displayTitle} />
        <p className="mt-1 text-sm text-site-mantle max-md:line-clamp-2 md:truncate">{evidence(item)}</p>
      </div>
      <FigureStrip>
        <PriceFigure label="You pay" value={formatListedEuros(item.cost.total)} href={item.listingUrl} />
        <PriceFigure label="Lowest listed" value={formatListedEuros(item.marketFloor)} href={item.cardmarketUrl} />
        <PriceFigure label="Edge" value={formatSignedEuros(item.edge)} tone="text-site-envy" />
      </FigureStrip>
    </li>
  )
}

function NoCompsListRow({ item }: { item: NoCompsRow }) {
  return (
    <li className={`${CARD_ROW} md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-x-6`}>
      <CardThumbnail src={item.imageUrl} />
      <div className="min-w-0">
        <DealTitle title={item.displayTitle} />
        <p className="mt-1 text-sm text-site-foil max-md:line-clamp-2 md:truncate">{item.reason}</p>
        <p className="mt-1 text-sm text-site-mantle max-md:line-clamp-2 md:truncate">{evidence(item)}</p>
      </div>
      <FigureStrip>
        <PriceFigure label="You pay" value={formatListedEuros(item.cost.total)} href={item.listingUrl} />
        {item.cardmarketUrl ? <PriceFigure label="Cardmarket" value="Open" href={item.cardmarketUrl} /> : null}
      </FigureStrip>
    </li>
  )
}

function ProblemListRow({ item }: { item: ProblemRow }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-3 sm:gap-6">
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

function Accordion({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-site-mulled-wine">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 select-none smooth hover:bg-site-mulled-wine/30 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">{title}</span>
          <span className="rounded-full bg-site-mulled-wine px-2 py-0.5 text-xs tabular-nums text-site-gray-nurse">{count}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 text-site-mantle smooth group-open:rotate-180">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="border-t border-site-mulled-wine px-4 pb-2">{children}</div>
    </details>
  )
}

export default function DealFinder({
  report,
  scanning,
  scanError,
  onScan
}: {
  report: DealFinderReport | null
  scanning: ScanningSources
  scanError: string | null
  onScan: (source: DealSource) => void
}) {
  const deals = report?.deals ?? []
  const noComps = report?.noComps ?? []
  const problems = groupProblems(report?.problems ?? [])
  const problemCount = report?.problems.length ?? 0
  // A source's fatal error and the notes from part-way through its walk read the same
  // way on screen: something this marketplace could not do.
  const sourceErrors = (report?.sources ?? [])
    .flatMap((source) => [source.error, ...(source.notes ?? [])])
    .filter((error): error is string => Boolean(error))
  const anyScanning = DEAL_SOURCES.some((source) => scanning[source])

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="title-l">Deal finder</h1>
        {/* Each marketplace is scanned on its own, so each gets its own button. */}
        <div className="flex flex-wrap items-center gap-2">
          {DEAL_SOURCES.map((source) => (
            <ScanButton key={source} source={source} scanning={scanning[source]} onScan={onScan} />
          ))}
        </div>
      </div>

      {scanError ? <p className="content-m text-site-loss">{scanError}</p> : null}
      {[...(report?.errors ?? []), ...sourceErrors].map((error) => (
        <p key={error} className="content-m text-site-loss">
          {error}
        </p>
      ))}

      {anyScanning && deals.length === 0 ? (
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
        <Accordion title="No Cardmarket price" count={noComps.length}>
          <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine p-0">
            {noComps.map((item) => (
              <NoCompsListRow key={item.id} item={item} />
            ))}
          </ol>
        </Accordion>
      ) : null}

      {problemCount > 0 ? (
        <Accordion title="Could not check" count={problemCount}>
          <div className="flex flex-col divide-y divide-site-mulled-wine">
            {problems.map((group) => (
              <div key={group.reason} className="flex flex-col gap-2 py-4">
                <p className="text-sm font-semibold text-site-foil">
                  {group.reason} <span className="font-normal text-site-mantle">({group.rows.length})</span>
                </p>
                <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine p-0">
                  {group.rows.map((item) => (
                    <ProblemListRow key={item.id} item={item} />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Accordion>
      ) : null}
    </section>
  )
}
