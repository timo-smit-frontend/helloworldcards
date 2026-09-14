import { RotateCw } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import { Link } from 'react-router'
import { adminTo } from '~/admin/runtime'
import Image from '~/components/elements/Image'
import type { VintedListingStatus, VintedRelistReport, VintedRelistRow } from '~/services/vinted-relist'

const STATUS_LABEL: Record<VintedListingStatus, string> = {
  live: 'Live',
  reserved: 'Reserved',
  hidden: 'Hidden',
  draft: 'Draft',
  closed: 'Closed'
}

/** `0` → today, `1` → 1 day, `12` → 12 days. */
export function formatAge(row: Pick<VintedRelistRow, 'ageDays' | 'ageText'>): string {
  if (row.ageDays == null) {
    return row.ageText ?? 'Age unknown'
  }
  if (row.ageDays === 0) {
    return 'Today'
  }
  return `${row.ageDays} ${row.ageDays === 1 ? 'day' : 'days'}`
}

function formatPrice(value: number | null): string {
  if (value == null) {
    return '—'
  }
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value)
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-14 flex-col items-end gap-1 text-right">
      <p className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">{label}</p>
      <p className={`font-semibold tabular-nums tracking-[-0.03em] ${tone ?? 'text-site-gray-nurse'}`}>{value}</p>
    </div>
  )
}

function ProductLink({ product }: { product: VintedRelistRow['product'] }) {
  if (!product) {
    return <p className="mt-1 truncate text-sm text-site-foil">Not linked to a product</p>
  }
  return (
    <p className="mt-1 truncate text-sm text-site-mantle">
      <Link
        to={adminTo(`/products/${product.id}`)}
        className="underline decoration-site-mantle/40 underline-offset-2 smooth hover:text-site-gray-nurse"
      >
        {product.title}
      </Link>
    </p>
  )
}

function RelistButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="button-quiet w-fit! gap-2 disabled:cursor-not-allowed disabled:opacity-60"
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={onClick}
    >
      <MorphIcon icon={RotateCw} size={16} strokeWidth={2.25} className={busy ? 'animate-spin' : undefined} />
      {busy ? 'Relisting…' : label}
    </button>
  )
}

/** A week is roughly when a listing has slid off the first pages of the catalogue. */
const STALE_AFTER_DAYS = 7

function ListingRow({ row, busy, blocked, onRelist }: { row: VintedRelistRow; busy: boolean; blocked: boolean; onRelist: () => void }) {
  const stale = row.ageDays != null && row.ageDays >= STALE_AFTER_DAYS
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6">
      <Thumbnail src={row.imageUrl} />
      <div className="min-w-0">
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-semibold text-site-gray-nurse underline decoration-site-mantle/40 underline-offset-2 smooth hover:decoration-site-gray-nurse"
        >
          {row.title}
        </a>
        <ProductLink product={row.product} />
        {row.status !== 'live' ? <p className="mt-1 text-sm text-site-foil">{STATUS_LABEL[row.status]}</p> : null}
      </div>
      <div className="col-span-2 flex justify-end gap-5 sm:col-span-1 sm:gap-8">
        <Stat label="Age" value={formatAge(row)} tone={stale ? 'text-site-foil' : undefined} />
        <Stat label="Views" value={row.views == null ? '—' : String(row.views)} />
        <Stat label="Likes" value={row.favourites == null ? '—' : String(row.favourites)} />
        <Stat label="Price" value={formatPrice(row.price)} />
      </div>
      <div className="col-span-2 flex justify-end sm:col-span-1">
        <RelistButton label="Relist" busy={busy} disabled={blocked || row.status !== 'live'} onClick={onRelist} />
      </div>
    </li>
  )
}

function PendingRow({
  item,
  busy,
  blocked,
  onRetry
}: {
  item: VintedRelistReport['pending'][number]
  busy: boolean
  blocked: boolean
  onRetry: () => void
}) {
  return (
    <li className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <p className="truncate font-semibold text-site-gray-nurse">{item.title}</p>
        <ProductLink product={item.product} />
        <p className="mt-1 text-sm text-site-loss">
          {item.error || (item.deletedAt ? 'The upload did not finish.' : 'The delete did not finish.')}
        </p>
      </div>
      <div className="flex justify-end">
        <RelistButton label={item.deletedAt ? 'Retry upload' : 'Retry relist'} busy={busy} disabled={blocked} onClick={onRetry} />
      </div>
    </li>
  )
}

export default function VintedRelist({
  report,
  loading,
  relisting,
  error,
  onRefresh,
  onRelist
}: {
  report: VintedRelistReport | null
  loading: boolean
  /** The listing being relisted right now; one at a time, since one tab does the work. */
  relisting: string | null
  error: string | null
  onRefresh: () => void
  onRelist: (itemId: string, title: string) => void
}) {
  const rows = report?.rows ?? []
  const pending = report?.pending ?? []
  const missing = report?.missing ?? []
  const blocked = loading || relisting != null

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">Vinted relist</h2>
          <button
            type="button"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-site-mantle smooth hover:bg-site-mid hover:text-site-gray-nurse disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={loading ? 'Reading Vinted' : 'Refresh from Vinted'}
            onClick={onRefresh}
            disabled={blocked}
          >
            <MorphIcon icon={RotateCw} size={18} strokeWidth={2.25} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>
        {report?.login ? <p className="text-sm text-site-mantle">Logged in as {report.login}</p> : null}
      </div>

      <p className="content-m text-site-mantle">
        Relisting deletes the Vinted post and uploads an exact copy — same photos, title, description and price — so it shows up as new
        again. Views and likes start from zero.
      </p>

      {error ? <p className="content-m text-site-loss">{error}</p> : null}

      {pending.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-[0.22em] text-site-loss uppercase">Deleted, not yet re-uploaded</h3>
          <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine p-0">
            {pending.map((item) => (
              <PendingRow
                key={item.itemId}
                item={item}
                busy={relisting === item.itemId}
                blocked={blocked}
                onRetry={() => onRelist(item.itemId, item.title)}
              />
            ))}
          </ol>
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="content-m text-site-mantle">Reading your Vinted wardrobe…</p>
      ) : rows.length === 0 ? (
        <p className="content-m text-site-mantle">
          {report ? 'Nothing is listed on Vinted right now.' : 'Refresh to read your Vinted listings.'}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine p-0">
          {rows.map((row) => (
            <ListingRow
              key={row.itemId}
              row={row}
              busy={relisting === row.itemId}
              blocked={blocked}
              onRelist={() => onRelist(row.itemId, row.title)}
            />
          ))}
        </ol>
      )}

      {missing.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-[0.22em] text-site-mantle uppercase">In the shop, not on Vinted</h3>
          <ol className="m-0 flex list-none flex-col divide-y divide-site-mulled-wine border-y border-site-mulled-wine p-0">
            {missing.map((item) => (
              <li key={item.product.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                <Link
                  to={adminTo(`/products/${item.product.id}`)}
                  className="truncate font-semibold text-site-gray-nurse underline decoration-site-mantle/40 underline-offset-2 smooth"
                >
                  {item.product.title}
                </Link>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-mono text-xs text-site-mantle underline smooth hover:text-site-gray-nurse"
                >
                  {item.url}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
