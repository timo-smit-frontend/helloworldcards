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
 * unless a job is waiting for a slot, which takes it over instead — or one arrives
 * within `lingerMs`, for a job that is on its way but not in the queue yet; a tab
 * nobody has come for by then is closed. A job that failed leaves its tab as it is,
 * out of the pool, for what it shows — the login page, a bot check, a form that did
 * not go through — until the window closes.
 */
export type TabLike = { isClosed(): boolean; close(): Promise<void> }

export type TabPool<P extends TabLike> = {
  run<T>(open: () => Promise<P>, job: (tab: () => Promise<P>) => Promise<T>): Promise<T>
  /** How many jobs are running, how many are waiting for a slot, and how many tabs are kept for the next job. */
  size(): { running: number; waiting: number; idle: number }
}

export function createTabPool<P extends TabLike>({
  limit,
  afterJob,
  lingerMs = 0
}: {
  limit: number
  afterJob: 'keep' | 'close'
  /** With `close`: how long a tab is kept once its job is done for a job that has not arrived yet. */
  lingerMs?: number
}): TabPool<P> {
  let running = 0
  const waiting: Array<() => void> = []
  /** The tabs kept for the next job, oldest first, each with when its last job was done. */
  const idle: Array<{ tab: P; since: number }> = []
  let sweep: NodeJS.Timeout | null = null

  async function slot(): Promise<void> {
    if (running < limit) {
      running += 1
      return
    }
    // The slot of the job that finishes next is handed straight on, so `running` stays as it is.
    await new Promise<void>((resolve) => waiting.push(resolve))
  }

  async function closeAll(tabs: Array<{ tab: P }>): Promise<void> {
    await Promise.all(tabs.map(({ tab }) => tab.close().catch(() => undefined)))
  }

  /**
   * Close the tabs that have lingered their time with no job come for them, once the
   * oldest has — and look again for the rest. Nothing is closed while a job is waiting
   * for a slot: the tabs are its, however long they have been there; the next job to
   * finish with nothing waiting looks again.
   */
  function sweepLater(): void {
    if (sweep || idle.length === 0) {
      return
    }
    sweep = setTimeout(
      async () => {
        sweep = null
        if (waiting.length > 0) {
          return
        }
        const now = Date.now()
        const lingered = idle.filter(({ since }) => now - since >= lingerMs)
        idle.splice(0, idle.length, ...idle.filter(({ since }) => now - since < lingerMs))
        await closeAll(lingered)
        sweepLater()
      },
      Math.max(0, idle[0].since + lingerMs - Date.now())
    )
    // A tab left lingering must not keep the dev server from stopping.
    sweep.unref()
  }

  async function release(page: P | null, wentWell: boolean): Promise<void> {
    if (page && !page.isClosed() && (afterJob === 'keep' || wentWell)) {
      idle.push({ tab: page, since: Date.now() })
    }
    // Tabs are only kept for the jobs waiting — and, for the linger, for one that may
    // yet arrive. Otherwise none are kept: this job's, or one a job that never asked
    // for its tab left behind.
    if (afterJob === 'close' && waiting.length === 0) {
      if (lingerMs > 0) {
        sweepLater()
      } else {
        await closeAll(idle.splice(0))
      }
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
      const kept = idle.shift()
      if (!kept) {
        return await open()
      }
      if (!kept.tab.isClosed()) {
        return kept.tab
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
