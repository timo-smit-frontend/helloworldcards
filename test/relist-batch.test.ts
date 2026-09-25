import { describe, expect, it, vi } from 'vitest'
import { createRemoteRelistQueue, type BatchCall } from '../app/admin/relist-batch'
import type { RelistAnswer } from '../app/admin/relist-queue'
import { createRelistBatch, handleRelistBatchRequest, type RelistBatch } from '../vite/relist-batch'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A stand-in relist: every listing sent waits until the test answers it. */
function fakeRelist() {
  const sent: string[] = []
  const open = new Map<string, (answer: RelistAnswer) => void>()
  return {
    sent,
    send(itemId: string) {
      sent.push(itemId)
      return new Promise<RelistAnswer>((resolve) => open.set(itemId, resolve))
    },
    async answer(itemId: string, answer: RelistAnswer = { ok: true }) {
      open.get(itemId)!(answer)
      open.delete(itemId)
      await tick()
    }
  }
}

function batchWith(relist = fakeRelist()) {
  const awake = { holds: 0, taken: 0 }
  const batch = createRelistBatch({
    send: relist.send,
    slots: 1,
    keepAwake: () => {
      awake.holds += 1
      awake.taken += 1
      return () => {
        awake.holds -= 1
      }
    }
  })
  return { batch, relist, awake }
}

const signedIn = async () => null

function request(path: string, init?: RequestInit) {
  return new Request(`http://127.0.0.1/api/admin/vinted-relist/batch${path}`, init)
}

async function body(response: Response | null) {
  return (await response!.json()) as { batch: ReturnType<RelistBatch['state']>; error?: string }
}

describe('the dev server’s relist batch', () => {
  it('works through the whole batch on its own, one listing after the other', async () => {
    const { batch, relist } = batchWith()
    batch.add(['1', '2', '3'])
    expect(relist.sent).toEqual(['1'])
    await relist.answer('1')
    await relist.answer('2')
    await relist.answer('3')
    expect(relist.sent).toEqual(['1', '2', '3'])
    expect(batch.state()).toEqual({ queue: [], done: ['1', '2', '3'], errors: {}, ended: 1 })
  })

  it('keeps the computer awake for exactly as long as a batch is under way', async () => {
    const { batch, relist, awake } = batchWith()
    expect(awake.holds).toBe(0)
    batch.add(['1', '2'])
    expect(awake.holds).toBe(1)
    await relist.answer('1')
    // Between two listings of one batch it stays held, and is not taken twice.
    expect(awake).toEqual({ holds: 1, taken: 1 })
    await relist.answer('2')
    expect(awake.holds).toBe(0)

    batch.add(['3'])
    expect(awake).toEqual({ holds: 1, taken: 2 })
    await relist.answer('3', { ok: false, status: 500, error: 'Vinted changed the form.' })
    expect(awake.holds).toBe(0)
  })

  it('lets go of the computer once a stopped batch has finished the listing it was on', async () => {
    const { batch, relist, awake } = batchWith()
    batch.add(['1', '2', '3'])
    batch.stop()
    expect(awake.holds).toBe(1)
    await relist.answer('1')
    expect(relist.sent).toEqual(['1'])
    expect(awake.holds).toBe(0)
  })
})

describe('the batch routes', () => {
  it('queues listings and answers where the batch is', async () => {
    const { batch, relist } = batchWith()
    const added = await handleRelistBatchRequest(
      request('', { method: 'POST', body: JSON.stringify({ itemIds: ['10', '11'] }) }),
      batch,
      signedIn
    )
    expect((await body(added)).batch.queue).toEqual(['10', '11'])
    expect(relist.sent).toEqual(['10'])

    const read = await handleRelistBatchRequest(request(''), batch, signedIn)
    expect((await body(read)).batch).toEqual({ queue: ['10', '11'], done: [], errors: {}, ended: 0 })
  })

  it('stops, clears errors, and forgets relisted listings the list no longer has', async () => {
    const { batch, relist } = batchWith()
    batch.add(['1', '2', '3'])
    await handleRelistBatchRequest(request('/stop', { method: 'POST' }), batch, signedIn)
    expect(batch.state().queue).toEqual(['1'])
    await relist.answer('1')

    batch.add(['4'])
    await relist.answer('4', { ok: false, status: 500, error: 'Broke.' })
    await handleRelistBatchRequest(request('/clear-errors', { method: 'POST' }), batch, signedIn)
    expect(batch.state().errors).toEqual({})

    const seen = await handleRelistBatchRequest(
      request('/seen', { method: 'POST', body: JSON.stringify({ listed: ['99'] }) }),
      batch,
      signedIn
    )
    expect((await body(seen)).batch.done).toEqual([])
  })

  it('turns away anyone not signed in, and bodies that are not listing ids', async () => {
    const { batch, relist } = batchWith()
    const refused = await handleRelistBatchRequest(request(''), batch, async () =>
      Response.json({ error: 'Sign in required' }, { status: 401 })
    )
    expect(refused?.status).toBe(401)

    const bad = await handleRelistBatchRequest(
      request('', { method: 'POST', body: JSON.stringify({ itemIds: ['../etc'] }) }),
      batch,
      signedIn
    )
    expect(bad?.status).toBe(400)
    expect(relist.sent).toEqual([])
  })

  it('leaves every other path alone, the relist of one listing included', async () => {
    const { batch } = batchWith()
    expect(await handleRelistBatchRequest(new Request('http://127.0.0.1/api/admin/vinted-relist/10'), batch, signedIn)).toBeNull()
    expect(await handleRelistBatchRequest(new Request('http://127.0.0.1/api/admin/vinted-relist'), batch, signedIn)).toBeNull()
    expect(await handleRelistBatchRequest(new Request('http://127.0.0.1/api/admin/vinted-relist/batchy'), batch, signedIn)).toBeNull()
  })
})

/** The admin's side, talking to a real batch through its routes. */
function adminFor(batch: RelistBatch) {
  const calls: string[] = []
  const call: BatchCall = async (path, init) => {
    calls.push(`${init?.method ?? 'GET'} ${path}`)
    const response = await handleRelistBatchRequest(request(path.replace('/vinted-relist/batch', ''), init), batch, signedIn)
    return { ok: response!.ok, status: response!.status, data: await response!.json() }
  }
  return { call, calls }
}

describe('the relist screen’s view of the batch', () => {
  it('hands the whole batch to the dev server at once', async () => {
    const { batch, relist } = batchWith()
    const { call, calls } = adminFor(batch)
    const queue = createRemoteRelistQueue({ call, inView: () => true })
    queue.add(['1', '2', '3'])
    // Queued on screen straight away.
    expect(queue.state().queue).toEqual(['1', '2', '3'])
    await tick()
    expect(calls).toEqual(['POST /vinted-relist/batch'])
    expect(relist.sent).toEqual(['1'])
  })

  it('reads the batch back while the screen is open, and says once when a batch has ended', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const { batch, relist } = batchWith()
      const { call } = adminFor(batch)
      const queue = createRemoteRelistQueue({ call, pollMs: 1_000, inView: () => true })
      const reads = vi.fn()
      queue.onBatchEnd(reads)
      const stop = queue.subscribe(() => undefined)
      batch.add(['1', '2'])
      await vi.advanceTimersByTimeAsync(1_000)
      expect(queue.state().queue).toEqual(['1', '2'])

      await relist.answer('1')
      await relist.answer('2')
      await vi.advanceTimersByTimeAsync(1_000)
      expect(queue.state()).toEqual({ queue: [], done: ['1', '2'], errors: {} })
      expect(reads).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(3_000)
      expect(reads).toHaveBeenCalledTimes(1)
      stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not take a batch that ended before the screen was opened for one that just did', async () => {
    const { batch, relist } = batchWith()
    batch.add(['1'])
    await relist.answer('1')
    const { call } = adminFor(batch)
    const queue = createRemoteRelistQueue({ call, inView: () => true })
    const reads = vi.fn()
    queue.onBatchEnd(reads)
    const stop = queue.subscribe(() => undefined)
    await tick()
    expect(queue.state().done).toEqual(['1'])
    expect(reads).not.toHaveBeenCalled()
    stop()
  })

  it('does not ask while the phone is locked or the tab is in the background', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const { batch } = batchWith()
      const { call, calls } = adminFor(batch)
      const queue = createRemoteRelistQueue({ call, pollMs: 1_000, inView: () => false })
      const stop = queue.subscribe(() => undefined)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(calls).toEqual([])
      stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows why a batch could not be handed over', async () => {
    const queue = createRemoteRelistQueue({
      call: async () => ({ ok: false, status: 401, data: { error: 'Sign in required' } }),
      inView: () => true
    })
    queue.add(['1'])
    await tick()
    expect(queue.state()).toEqual({ queue: [], done: [], errors: { 1: 'Sign in required' } })
  })

  it('does not let a read that crossed a press take the pressed listings off the screen', async () => {
    const { batch } = batchWith()
    let answerRead: (value: Awaited<ReturnType<BatchCall>>) => void = () => undefined
    const { call: real } = adminFor(batch)
    const call: BatchCall = (path, init) =>
      init?.method === 'GET'
        ? new Promise((resolve) => {
            answerRead = resolve
          })
        : real(path, init)
    const queue = createRemoteRelistQueue({ call, inView: () => true })
    const stop = queue.subscribe(() => undefined)
    queue.add(['1'])
    await tick()
    // The read left before the press, and comes back without it.
    answerRead({ ok: true, status: 200, data: { batch: { queue: [], done: [], errors: {}, ended: 0 } } })
    await tick()
    expect(queue.state().queue).toEqual(['1'])
    stop()
  })
})
