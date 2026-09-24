import { Check, CircleStop, RotateCw } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { adminTo } from '~/admin/runtime'
import Image from '~/components/elements/Image'
import { RELIST_TABS, type VintedListingStatus, type VintedRelistReport, type VintedRelistRow } from '~/services/vinted-relist'

const STATUS_LABEL: Record<VintedListingStatus, string> = {
  live: 'Live',
  reserved: 'Reserved',
  hidden: 'Hidden',
  draft: 'Draft',
  closed: 'Closed'
}

/**
 * `1` → 1 day, `12` → 12 days. A listing from today shows its age in hours (or minutes
 * within the first hour) when we know the exact moment it went up, plain "Today" otherwise.
 */
export function formatAge(row: Pick<VintedRelistRow, 'ageDays' | 'ageText' | 'listedAt'>, now = new Date()): string {
  if (row.ageDays == null) {
    return row.ageText ?? 'Age unknown'
  }
  if (row.ageDays === 0) {
    const listedAt = row.listedAt ? new Date(row.listedAt).getTime() : Number.NaN
    if (Number.isNaN(listedAt)) {
      return 'Today'
    }
    const minutes = Math.max(0, Math.floor((now.getTime() - listedAt) / 60_000))
    if (minutes < 60) {
      return `${minutes} min`
    }
    const hours = Math.floor(minutes / 60)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
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
    <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md">
      {src ? (
        <Image
          src={src}
          alt=""
          title=""
          width={128}
          height={192}
          sizes="64px"
          aria-hidden
          className="absolute inset-0 m-auto h-auto max-h-full w-auto max-w-full rounded-md"
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

/**
 * How long a first press keeps the button asking for the second: enough to read
 * "Confirm" and press again, not so long that a button left armed still is when
 * the eye comes back to the list.
 */
const CONFIRM_WINDOW_MS = 4_000

/**
 * What a listing's relist is up to, as far as this screen knows: waiting for one
 * of the tabs, in a tab, or done and waiting for the list to be read again.
 */
export type RelistActivity = 'queued' | 'relisting' | 'done'

const ACTIVITY_LABEL: Record<RelistActivity, string> = {
  queued: 'Queued…',
  relisting: 'Relisting…',
  done: 'Relisted'
}

/**
 * A relist deletes a live post, so one stray click must not start it — but the
 * dialog that used to ask was slower to get through than the relist deserves. So
 * the button is pressed twice: the first press turns it into a red "Confirm", the
 * second, within a few seconds, goes ahead. A double-click does both. Leaving the
 * button, or waiting, settles it back.
 */
function RelistButton({
  label,
  activity,
  disabled,
  onClick
}: {
  label: string
  activity: RelistActivity | null
  disabled: boolean
  onClick: () => void
}) {
  const [armed, setArmed] = useState(false)
  const inert = disabled || activity != null
  const asking = armed && !inert

  useEffect(() => {
    if (!armed) {
      return
    }
    const settle = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS)
    return () => clearTimeout(settle)
  }, [armed])

  return (
    <button
      type="button"
      className={`${asking ? 'button-danger' : 'button-quiet'} w-fit! gap-2 disabled:cursor-not-allowed disabled:opacity-60`}
      aria-busy={activity === 'relisting' || activity === 'queued'}
      disabled={inert}
      onClick={() => {
        if (!asking) {
          setArmed(true)
          return
        }
        setArmed(false)
        onClick()
      }}
      onBlur={() => setArmed(false)}
    >
      <MorphIcon
        icon={activity === 'done' ? Check : RotateCw}
        size={16}
        strokeWidth={2.25}
        className={activity === 'relisting' ? 'animate-spin' : undefined}
      />
      {activity ? ACTIVITY_LABEL[activity] : asking ? 'Confirm' : label}
    </button>
  )
}

/** A week is roughly when a listing has slid off the first pages of the catalogue. */
const STALE_AFTER_DAYS = 7

function ListingRow({
  row,
  activity,
  error,
  blocked,
  onRelist
}: {
  row: VintedRelistRow
  activity: RelistActivity | null
  error: string | undefined
  blocked: boolean
  onRelist: () => void
}) {
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
        {error ? <p className="mt-1 text-sm text-site-loss">{error}</p> : null}
      </div>
      <div className="col-span-2 flex justify-end gap-5 sm:col-span-1 sm:gap-8">
        <Stat label="Age" value={formatAge(row)} tone={stale ? 'text-site-foil' : undefined} />
        <Stat label="Views" value={row.views == null ? '—' : String(row.views)} />
        <Stat label="Likes" value={row.favourites == null ? '—' : String(row.favourites)} />
        <Stat label="Price" value={formatPrice(row.price)} />
      </div>
      <div className="col-span-2 flex justify-end sm:col-span-1">
        <RelistButton
          label={error ? 'Retry' : 'Relist'}
          activity={activity}
          disabled={blocked || row.status !== 'live'}
          onClick={onRelist}
        />
      </div>
    </li>
  )
}

function PendingRow({
  item,
  activity,
  error,
  blocked,
  onRetry
}: {
  item: VintedRelistReport['pending'][number]
  activity: RelistActivity | null
  error: string | undefined
  blocked: boolean
  onRetry: () => void
}) {
  return (
    <li className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <p className="truncate font-semibold text-site-gray-nurse">{item.title}</p>
        <ProductLink product={item.product} />
        {activity ? null : (
          <p className="mt-1 text-sm text-site-loss">
            {error || item.error || (item.deletedAt ? 'The upload did not finish.' : 'The delete did not finish.')}
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <RelistButton label={item.deletedAt ? 'Retry upload' : 'Retry relist'} activity={activity} disabled={blocked} onClick={onRetry} />
      </div>
    </li>
  )
}

const COUNT_IN_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six']

export default function VintedRelist({
  report,
  loading,
  relisting,
  done,
  errors,
  error,
  onRefresh,
  onRelist,
  onStop
}: {
  report: VintedRelistReport | null
  loading: boolean
  /** The listings being relisted or waiting for it, in the order they were asked for. */
  relisting: string[]
  /** Relisted since the list was last read; it is read again once the last of a batch is done. */
  done: string[]
  /** What went wrong with a listing's last relist, by listing. */
  errors: Record<string, string>
  error: string | null
  onRefresh: () => void
  /** Queue these listings for a relist, in this order, behind any already queued. */
  onRelist: (itemIds: string[]) => void
  /** Let the relists still waiting go. */
  onStop: () => void
}) {
  const rows = report?.rows ?? []
  const pending = report?.pending ?? []
  const missing = report?.missing ?? []
  const batch = relisting.length > 0
  const waiting = relisting.length > RELIST_TABS

  // The first few are in the tabs, the rest wait for one. A listing the dev server
  // says it is relisting for someone else — another tab of the admin, or this one
  // before a reload — is busy too, until the list is read again.
  const activityOf = (itemId: string): RelistActivity | null => {
    const at = relisting.indexOf(itemId)
    if (at !== -1) {
      return at < RELIST_TABS ? 'relisting' : 'queued'
    }
    if (done.includes(itemId)) {
      return 'done'
    }
    return report?.relisting.includes(itemId) ? 'relisting' : null
  }

  // Every live listing that is not busy already, down the list: the oldest first.
  const relistAll = rows.filter((row) => row.status === 'live' && activityOf(row.itemId) == null).map((row) => row.itemId)

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
            disabled={loading || batch}
          >
            <MorphIcon icon={RotateCw} size={18} strokeWidth={2.25} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>
        {rows.length === 0 ? null : waiting ? (
          <button type="button" className="button-quiet w-fit! gap-2" onClick={onStop}>
            <MorphIcon icon={CircleStop} size={16} strokeWidth={2.25} />
            Stop
          </button>
        ) : (
          <RelistButton
            label="Relist all"
            activity={null}
            disabled={loading || relistAll.length === 0}
            onClick={() => onRelist(relistAll)}
          />
        )}
      </div>

      <p className="content-m text-site-mantle">
        Relisting deletes the Vinted post and uploads an exact copy with the same photos, title, description and price, so it shows up as
        new again. Views and likes start from zero.{' '}
        {RELIST_TABS === 1
          ? 'Listings are relisted one at a time, in a Chrome tab; the rest wait their turn.'
          : `Up to ${COUNT_IN_WORDS[RELIST_TABS] ?? RELIST_TABS} are relisted at once, each in a Chrome tab of its own; the rest wait their turn.`}
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
                activity={activityOf(item.itemId)}
                error={errors[item.itemId]}
                blocked={loading}
                onRetry={() => onRelist([item.itemId])}
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
              activity={activityOf(row.itemId)}
              error={errors[row.itemId]}
              blocked={loading}
              onRelist={() => onRelist([row.itemId])}
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
