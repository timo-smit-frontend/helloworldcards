export const ADMIN_LOADING_MIN_MS = 500

const pulse = 'animate-pulse rounded-md bg-site-mulled-wine motion-reduce:animate-none'

export function AdminLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-site-dark text-site-gray-nurse">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <span
          className="size-10 animate-spin rounded-full border-2 border-site-mulled-wine border-t-site-envy motion-reduce:animate-none"
          aria-hidden="true"
        />
        <p className="content-l text-site-mantle">Loading…</p>
      </div>
    </div>
  )
}

export function AdminTableSkeleton({ rows = 6, columns = 3 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col" role="status" aria-live="polite" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <div className="flex gap-4 border-b border-site-mulled-wine py-3">
        {Array.from({ length: columns }, (_, index) => (
          <div key={index} className={`${pulse} h-3 ${index === 0 ? 'w-16' : 'w-12'}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-site-mulled-wine py-3.5">
          {Array.from({ length: columns }, (_, index) => (
            <div key={index} className={`${pulse} h-5 ${index === 0 ? 'min-w-0 flex-1' : 'w-20 shrink-0'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function AdminBlocksSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-label="Loading components">
      <span className="sr-only">Loading components…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-panel bg-site-gunmetal px-4 py-3 ring-1 ring-site-mulled-wine">
          <div className={`${pulse} h-4 w-6`} />
          <div className={`${pulse} aspect-2/1 w-24 shrink-0 sm:w-40`} />
          <div className={`${pulse} h-5 min-w-0 flex-1 max-sm:hidden`} />
        </div>
      ))}
    </div>
  )
}

export function AdminFormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4" role="status" aria-live="polite" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <div className={`${pulse} h-9 w-40`} />
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className={`${pulse} h-4 w-24`} />
          <div className={`${pulse} h-12 w-full`} />
        </div>
      ))}
    </div>
  )
}

export function remainingLoadingHold(startedAt: number, now = Date.now(), minMs = ADMIN_LOADING_MIN_MS): number {
  return Math.max(0, minMs - (now - startedAt))
}
