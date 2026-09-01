export const ADMIN_LOADING_MIN_MS = 1000

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

export function remainingLoadingHold(startedAt: number, now = Date.now(), minMs = ADMIN_LOADING_MIN_MS): number {
  return Math.max(0, minMs - (now - startedAt))
}
