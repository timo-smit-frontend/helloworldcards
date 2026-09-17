import type { CmsPageStatus } from '~/cms/types'

export type StatusBadgeStatus = 'published' | 'reserved' | 'sold' | 'concept' | CmsPageStatus

/** One colour per status, so the lists can be read at a glance: live is green, money not in yet is gold, gone is red, not live yet is muted. */
const STATUS_TONE: Record<StatusBadgeStatus, string> = {
  published: 'border-site-envy/50 bg-site-envy/15 text-site-envy',
  reserved: 'border-site-foil/50 bg-site-foil/15 text-site-foil',
  sold: 'border-site-loss/50 bg-site-loss/15 text-site-loss',
  concept: 'border-site-mulled-wine bg-site-mulled-wine/30 text-site-mantle',
  draft: 'border-site-mulled-wine bg-site-mulled-wine/30 text-site-mantle'
}

/** The one status pill, the same size everywhere so lists line up: the admin product and page lists and the dashboard's sold rows. */
export default function StatusBadge({ status }: { status: StatusBadgeStatus }) {
  return (
    <span
      className={`inline-flex h-6 w-20 shrink-0 items-center justify-center rounded-full border px-2.5 text-xs font-semibold capitalize ${STATUS_TONE[status]}`}
    >
      {status}
    </span>
  )
}
