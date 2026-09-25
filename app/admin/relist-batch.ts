import type { RelistQueue, RelistQueueState } from './relist-queue'

/**
 * The relist queue as the admin sees it: the dev server keeps it (`vite/relist-batch.ts`)
 * and works through it on its own, so a batch asked for from a phone goes on after the
 * phone is locked. The admin only asks, and reads back where the batch is — every couple
 * of seconds while the relist screen is open and in view.
 */

type BatchState = RelistQueueState & { ended: number }

export type BatchCall = (
  path: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; data: { batch?: BatchState; error?: string } | null }>

const EMPTY: RelistQueueState = { queue: [], done: [], errors: {} }

/** How often the screen reads the batch back. It asks only the dev server, never Vinted. */
const POLL_MS = 2_000

function same(a: RelistQueueState, b: RelistQueueState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function createRemoteRelistQueue({
  call,
  pollMs = POLL_MS,
  inView = () => typeof document === 'undefined' || document.visibilityState === 'visible'
}: {
  call: BatchCall
  pollMs?: number
  inView?: () => boolean
}): RelistQueue {
  let state = EMPTY
  /** The batch count last seen; null until the first answer, which is taken as it is. */
  let ended: number | null = null
  const listeners = new Set<() => void>()
  const batchEndListeners = new Set<() => void>()
  let timer: ReturnType<typeof setInterval> | null = null

  function set(next: RelistQueueState) {
    if (same(state, next)) {
      return
    }
    state = next
    for (const listener of listeners) {
      listener()
    }
  }

  function apply(batch: BatchState | undefined) {
    if (!batch) {
      return
    }
    set({ queue: batch.queue, done: batch.done, errors: batch.errors })
    const before = ended
    ended = batch.ended
    if (before != null && batch.ended > before) {
      for (const listener of batchEndListeners) {
        listener()
      }
    }
  }

  /** Changes sent so far, and how many still await their answer. */
  let writes = 0
  let writing = 0

  async function send(path: string, body?: unknown) {
    const read = body === undefined
    const asOf = writes
    if (!read) {
      writes += 1
      writing += 1
    }
    const result = await call(`/vinted-relist/batch${path}`, {
      method: read ? 'GET' : 'POST',
      ...(read ? {} : { body: JSON.stringify(body) })
    })
      .catch(() => null)
      .finally(() => {
        if (!read) {
          writing -= 1
        }
      })
    // A read that crossed a change would put back what the change just replaced.
    if (!read || (writing === 0 && writes === asOf)) {
      apply(result?.data?.batch)
    }
    return result
  }

  function poll() {
    if (inView()) {
      void send('')
    }
  }

  function onVisible() {
    if (inView()) {
      poll()
    }
  }

  function watch() {
    if (timer) {
      return
    }
    poll()
    timer = setInterval(poll, pollMs)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible)
    }
  }

  function unwatch() {
    if (!timer) {
      return
    }
    clearInterval(timer)
    timer = null
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      watch()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          unwatch()
        }
      }
    },
    add(itemIds) {
      const fresh = itemIds.filter((itemId, at) => itemIds.indexOf(itemId) === at && !state.queue.includes(itemId))
      if (fresh.length === 0) {
        return
      }
      // Show them queued straight away; the dev server's answer settles it.
      set({
        ...state,
        queue: [...state.queue, ...fresh],
        errors: Object.fromEntries(Object.entries(state.errors).filter(([itemId]) => !fresh.includes(itemId)))
      })
      void send('', { itemIds: fresh }).then((result) => {
        if (result?.data?.batch) {
          return
        }
        const error = result?.data?.error ?? 'The dev server did not take the relist. Refresh and try again.'
        set({
          ...state,
          queue: state.queue.filter((itemId) => !fresh.includes(itemId)),
          errors: { ...state.errors, ...Object.fromEntries(fresh.map((itemId) => [itemId, error])) }
        })
      })
    },
    stop() {
      void send('/stop', {})
    },
    listRead(listed) {
      const still = new Set(listed)
      set({ ...state, done: state.done.filter((itemId) => still.has(itemId)) })
      void send('/seen', { listed })
    },
    clearErrors() {
      set({ ...state, errors: {} })
      void send('/clear-errors', {})
    },
    onBatchEnd(listener) {
      batchEndListeners.add(listener)
      return () => {
        batchEndListeners.delete(listener)
      }
    }
  }
}
