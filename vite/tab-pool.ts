/**
 * A pool of tabs in the shared Chrome window, and the queue of work for them.
 *
 * Work is run up to `limit` jobs at a time, in the order it arrived; the rest wait
 * for a slot. A job gets a tab of its own for as long as it runs — one left by an
 * earlier job, or a fresh one from `open` when none is left — and only when it asks
 * for it, so a job that turns out to need no tab opens none. A tab closed by hand
 * or with the window is simply dropped when the next job would have had it.
 *
 * What becomes of a tab once its job is done is the pool's `afterJob`. `keep`: it
 * stays for the next job, whatever happened — for a tab that is expensive to open
 * and does the same thing every time. `close`: it is closed once the job went well,
 * unless a job is waiting for a slot, which takes it over instead; and a job that
 * failed leaves its tab as it is, out of the pool, for what it shows — the login
 * page, a bot check, a form that did not go through — until the window closes.
 */
export type TabLike = { isClosed(): boolean; close(): Promise<void> }

export type TabPool<P extends TabLike> = {
  run<T>(open: () => Promise<P>, job: (tab: () => Promise<P>) => Promise<T>): Promise<T>
  /** How many jobs are running, how many are waiting for a slot, and how many tabs are kept for the next job. */
  size(): { running: number; waiting: number; idle: number }
}

export function createTabPool<P extends TabLike>({ limit, afterJob }: { limit: number; afterJob: 'keep' | 'close' }): TabPool<P> {
  let running = 0
  const waiting: Array<() => void> = []
  const idle: P[] = []

  async function slot(): Promise<void> {
    if (running < limit) {
      running += 1
      return
    }
    // The slot of the job that finishes next is handed straight on, so `running` stays as it is.
    await new Promise<void>((resolve) => waiting.push(resolve))
  }

  async function release(page: P | null, wentWell: boolean): Promise<void> {
    if (page && !page.isClosed() && (afterJob === 'keep' || wentWell)) {
      idle.push(page)
    }
    // Tabs are only kept for the jobs waiting; with none waiting, none are kept —
    // this job's, or one a job that never asked for its tab left behind.
    if (afterJob === 'close' && waiting.length === 0) {
      await Promise.all(idle.splice(0).map((tab) => tab.close().catch(() => undefined)))
    }
    const next = waiting.shift()
    if (next) {
      next()
    } else {
      running -= 1
    }
  }

  async function acquire(open: () => Promise<P>): Promise<P> {
    for (;;) {
      const page = idle.shift()
      if (!page) {
        return await open()
      }
      if (!page.isClosed()) {
        return page
      }
    }
  }

  return {
    async run(open, job) {
      await slot()
      const held: { page: P | null; opening: Promise<P> | null } = { page: null, opening: null }
      const tab = () => (held.opening ??= acquire(open).then((page) => (held.page = page)))
      let wentWell = false
      try {
        const result = await job(tab)
        wentWell = true
        return result
      } finally {
        // A job that failed while its tab was still opening still has that tab dealt with.
        if (held.opening && !held.page) {
          await held.opening.catch(() => undefined)
        }
        await release(held.page, wentWell)
      }
    },
    size() {
      return { running, waiting: waiting.length, idle: idle.length }
    }
  }
}
