/**
 * The Vinted relists asked for, and the order they go in.
 *
 * A relist takes minutes, and `RELIST_TABS` of them run at a time; the rest wait their
 * turn here and go once a slot is free, in the order they were asked for.
 *
 * The dev server keeps the one queue (`vite/relist-batch.ts`), so a batch goes on to
 * its last listing with no admin open — the admin used to keep it, and a locked phone
 * stopped sending the next listing. The admin reads it back through
 * `createRemoteRelistQueue`, which has this same shape.
 */

/** How a relist answered. `status` is null when there was no answer at all. */
export type RelistAnswer = { ok: true } | { ok: false; status: number | null; error: string }

export type RelistQueueState = {
  /** The listings in a relist or waiting for one, in the order asked for: the first `slots` are with the dev server. */
  queue: string[]
  /** Relisted since the list was last read. */
  done: string[]
  /** What went wrong with a listing's last relist, by listing. */
  errors: Record<string, string>
}

export type RelistQueue = {
  state(): RelistQueueState
  subscribe(listener: () => void): () => void
  /** Queue listings behind the ones already queued, in the order given; one already queued keeps its place. */
  add(itemIds: string[]): void
  /** Let the relists still waiting go. The ones with the dev server finish: a relist cannot be called back halfway. */
  stop(): void
  /**
   * The list was read again, and has these listings. A relisted one it no longer has
   * has made way for its copy; one it still has was read before its relist was done,
   * and stays marked, so its button does not come back for a listing that is gone.
   */
  listRead(listed: string[]): void
  clearErrors(): void
  /**
   * Call `listener` once the last relist of a batch has answered and the list should
   * be read again: once for the whole batch, so the list does not re-sort under the
   * buttons while there is still pressing to do.
   */
  onBatchEnd(listener: () => void): () => void
}

/**
 * The dev server's answer for a card that has sold, or a listing another tab is
 * relisting already: a matter of that listing alone, so the rest go on.
 */
const REFUSED = 409

/**
 * Vinted wants a login, has rate-limited this computer, or cannot be reached: a read
 * would only ask again, or make the block worse.
 */
const NO_READ_AFTER = new Set([401, 429, 503])

export function createRelistQueue({
  slots,
  send
}: {
  /** How many relists are with the dev server at once. */
  slots: number
  /** Send one relist, and answer once it is done. */
  send: (itemId: string) => Promise<RelistAnswer>
}): RelistQueue {
  let state: RelistQueueState = { queue: [], done: [], errors: {} }
  const listeners = new Set<() => void>()
  const batchEndListeners = new Set<() => void>()
  /** The listings with the dev server. */
  const sent = new Set<string>()
  // How the batch under way has gone, for what to do once its last relist answers.
  let batch = { relisted: false, needsRead: false }

  function update(next: Partial<RelistQueueState>) {
    state = { ...state, ...next }
    for (const listener of listeners) {
      listener()
    }
  }

  function sendDue() {
    for (const itemId of state.queue.slice(0, slots)) {
      if (sent.has(itemId)) {
        continue
      }
      sent.add(itemId)
      void send(itemId)
        .catch((): RelistAnswer => ({
          ok: false,
          status: null,
          error: 'The dev server stopped answering mid-relist. Refresh to see where it got to.'
        }))
        .then((answer) => answered(itemId, answer))
    }
  }

  function answered(itemId: string, answer: RelistAnswer) {
    sent.delete(itemId)
    const queue = state.queue.filter((id) => id !== itemId)
    if (answer.ok) {
      batch.relisted = true
      update({ queue, done: [...state.done, itemId] })
    } else {
      // The delete may have gone through: read back what Vinted has now — unless Vinted
      // wants a login first, or has rate-limited us, in which case a read would only
      // ask (or make it worse) again.
      if (answer.status === null || !NO_READ_AFTER.has(answer.status)) {
        batch.needsRead = true
      }
      // Anything else stops the relists still waiting: one that failed may have deleted
      // its listing without putting it back up, and whatever stopped it would do the
      // same to every listing after it.
      update({
        queue: answer.status === REFUSED ? queue : queue.filter((id) => sent.has(id)),
        errors: { ...state.errors, [itemId]: answer.error }
      })
    }
    sendDue()
    if (state.queue.length > 0) {
      return
    }
    const { relisted, needsRead } = batch
    batch = { relisted: false, needsRead: false }
    // Read once for the whole batch; a read after a relist costs Vinted nothing.
    if (relisted || needsRead) {
      for (const listener of batchEndListeners) {
        listener()
      }
    }
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    add(itemIds) {
      const fresh = itemIds.filter((itemId, at) => itemIds.indexOf(itemId) === at && !state.queue.includes(itemId))
      if (fresh.length === 0) {
        return
      }
      update({
        queue: [...state.queue, ...fresh],
        errors: Object.fromEntries(Object.entries(state.errors).filter(([itemId]) => !fresh.includes(itemId)))
      })
      sendDue()
    },
    stop() {
      const queue = state.queue.filter((itemId) => sent.has(itemId))
      if (queue.length < state.queue.length) {
        update({ queue })
      }
    },
    listRead(listed) {
      const still = new Set(listed)
      const done = state.done.filter((itemId) => still.has(itemId))
      if (done.length < state.done.length) {
        update({ done })
      }
    },
    clearErrors() {
      if (Object.keys(state.errors).length > 0) {
        update({ errors: {} })
      }
    },
    onBatchEnd(listener) {
      batchEndListeners.add(listener)
      return () => {
        batchEndListeners.delete(listener)
      }
    }
  }
}
