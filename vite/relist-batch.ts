import { createRelistQueue, type RelistAnswer, type RelistQueueState } from '../app/admin/relist-queue'
import { RELIST_TABS } from '../app/services/vinted-relist'

/**
 * The relists the admin has asked for, kept by the dev server.
 *
 * The admin used to keep this queue itself and hand the dev server one listing at a
 * time. From a phone that stalls: a locked phone or a backgrounded Safari stops
 * running the page, so the next listing never went out, and the relist request held
 * open meanwhile was cut off as if the dev server had stopped answering. Here the
 * batch goes on to its last listing with nobody watching, and any admin — the phone,
 * the laptop, both — sees where it got to.
 *
 * While a batch is under way the computer is kept awake, whatever else is going on:
 * a Mac that sleeps halfway leaves the rest of the batch waiting until it is woken.
 */

export type RelistBatchState = RelistQueueState & {
  /** How many batches have ended with the list due a new read: the admin reads it once per step. */
  ended: number
}

export type RelistBatch = {
  state(): RelistBatchState
  add(itemIds: string[]): void
  stop(): void
  listRead(listed: string[]): void
  clearErrors(): void
}

export function createRelistBatch({
  send,
  keepAwake,
  slots = RELIST_TABS
}: {
  /** Relist one listing, and answer once it is done. */
  send: (itemId: string) => Promise<RelistAnswer>
  /** Hold the computer awake; call what it returns to let go. */
  keepAwake: () => () => void
  slots?: number
}): RelistBatch {
  const queue = createRelistQueue({ slots, send })
  let ended = 0
  let release: (() => void) | null = null

  queue.onBatchEnd(() => {
    ended += 1
  })
  queue.subscribe(() => {
    const busy = queue.state().queue.length > 0
    if (busy && !release) {
      release = keepAwake()
    } else if (!busy && release) {
      release()
      release = null
    }
  })

  return {
    state: () => ({ ...queue.state(), ended }),
    add: (itemIds) => queue.add(itemIds),
    stop: () => queue.stop(),
    listRead: (listed) => queue.listRead(listed),
    clearErrors: () => queue.clearErrors()
  }
}

const BATCH = '/api/admin/vinted-relist/batch'

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && /^\d+$/.test(item)) ? (value as string[]) : null
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * The batch's routes, for the admin that signed in:
 *
 * - `GET  …/batch` — where the batch is
 * - `POST …/batch` `{ itemIds }` — queue these listings behind the ones already queued
 * - `POST …/batch/stop` — let the relists still waiting go
 * - `POST …/batch/seen` `{ listed }` — the list was read again, and has these listings
 * - `POST …/batch/clear-errors`
 *
 * Every answer is `{ batch }`, the state after the change. Null for any other path.
 */
export async function handleRelistBatchRequest(
  request: Request,
  batch: RelistBatch,
  authorize: (request: Request) => Promise<Response | null>
): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, '')
  if (path !== BATCH && !path.startsWith(`${BATCH}/`)) {
    return null
  }
  const unauthorized = await authorize(request)
  if (unauthorized) {
    return unauthorized
  }
  const answer = () => Response.json({ batch: batch.state() })
  const post = request.method === 'POST'

  if (path === BATCH && request.method === 'GET') {
    return answer()
  }
  if (path === BATCH && post) {
    const itemIds = stringList((await readBody(request))?.itemIds)
    if (!itemIds) {
      return Response.json({ error: 'Send the listings to relist as { "itemIds": ["…"] }.' }, { status: 400 })
    }
    batch.add(itemIds)
    return answer()
  }
  if (path === `${BATCH}/stop` && post) {
    batch.stop()
    return answer()
  }
  if (path === `${BATCH}/seen` && post) {
    const listed = stringList((await readBody(request))?.listed)
    if (!listed) {
      return Response.json({ error: 'Send the listings read as { "listed": ["…"] }.' }, { status: 400 })
    }
    batch.listRead(listed)
    return answer()
  }
  if (path === `${BATCH}/clear-errors` && post) {
    batch.clearErrors()
    return answer()
  }
  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}
