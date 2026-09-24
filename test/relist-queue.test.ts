import { describe, expect, it } from 'vitest'
import { createRelistQueue, type RelistAnswer } from '../app/admin/relist-queue'

/** A stand-in dev server: every relist sent waits until the test answers it. */
function fakeDevServer() {
  const sent: string[] = []
  const open = new Map<string, { resolve: (answer: RelistAnswer) => void; reject: (error: Error) => void }>()
  return {
    sent,
    send(itemId: string) {
      sent.push(itemId)
      return new Promise<RelistAnswer>((resolve, reject) => open.set(itemId, { resolve, reject }))
    },
    async answer(itemId: string, answer: RelistAnswer = { ok: true }) {
      open.get(itemId)!.resolve(answer)
      open.delete(itemId)
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
    async hangUp(itemId: string) {
      open.get(itemId)!.reject(new TypeError('Failed to fetch'))
      open.delete(itemId)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}

function queueFor(server: ReturnType<typeof fakeDevServer>, slots = 1) {
  const queue = createRelistQueue({ slots, send: server.send })
  const reads = { count: 0 }
  queue.onBatchEnd(() => {
    reads.count += 1
  })
  return { queue, reads }
}

describe('relist queue', () => {
  it('sends one relist at a time, in the order they were asked for', async () => {
    const server = fakeDevServer()
    const { queue } = queueFor(server)

    queue.add(['oldest', 'middle', 'youngest'])
    expect(server.sent).toEqual(['oldest'])
    expect(queue.state().queue).toEqual(['oldest', 'middle', 'youngest'])

    await server.answer('oldest')
    expect(server.sent).toEqual(['oldest', 'middle'])
    expect(queue.state()).toEqual({ queue: ['middle', 'youngest'], done: ['oldest'], errors: {} })

    await server.answer('middle')
    await server.answer('youngest')
    expect(server.sent).toEqual(['oldest', 'middle', 'youngest'])
    expect(queue.state()).toEqual({ queue: [], done: ['oldest', 'middle', 'youngest'], errors: {} })
  })

  it('keeps as many relists with the dev server as it has slots', async () => {
    const server = fakeDevServer()
    const { queue } = queueFor(server, 2)

    queue.add(['1', '2', '3'])
    expect(server.sent).toEqual(['1', '2'])

    await server.answer('2')
    expect(server.sent).toEqual(['1', '2', '3'])
    expect(queue.state().queue).toEqual(['1', '3'])
  })

  it('queues a listing asked for twice once, where it was first asked for', () => {
    const server = fakeDevServer()
    const { queue } = queueFor(server)

    queue.add(['1', '2'])
    queue.add(['3', '2', '3'])
    expect(queue.state().queue).toEqual(['1', '2', '3'])
    expect(server.sent).toEqual(['1'])
  })

  it('reads the list once, after the last relist of the batch has answered', async () => {
    const server = fakeDevServer()
    const { queue, reads } = queueFor(server)

    queue.add(['1', '2'])
    await server.answer('1')
    expect(reads.count).toBe(0)
    queue.add(['3'])
    await server.answer('2')
    expect(reads.count).toBe(0)
    await server.answer('3')
    expect(reads.count).toBe(1)
  })

  it('lets the waiting relists go once one fails, and reads the list for what the failed one left', async () => {
    const server = fakeDevServer()
    const { queue, reads } = queueFor(server)

    queue.add(['1', '2', '3'])
    await server.answer('1', { ok: false, status: 500, error: 'Vinted’s brand picker does not open.' })

    // A broken upload form would have deleted every listing after it too.
    expect(server.sent).toEqual(['1'])
    expect(queue.state()).toEqual({ queue: [], done: [], errors: { '1': 'Vinted’s brand picker does not open.' } })
    expect(reads.count).toBe(1)
  })

  it('goes on past a listing the dev server refuses', async () => {
    const server = fakeDevServer()
    const { queue, reads } = queueFor(server)

    queue.add(['1', '2'])
    await server.answer('1', { ok: false, status: 409, error: 'Pikachu is sold. A sold card is not relisted.' })
    expect(server.sent).toEqual(['1', '2'])

    await server.answer('2')
    expect(queue.state()).toEqual({ queue: [], done: ['2'], errors: { '1': 'Pikachu is sold. A sold card is not relisted.' } })
    expect(reads.count).toBe(1)
  })

  it('stops without reading the list when Vinted wants a login, is rate limiting, or cannot be reached', async () => {
    for (const status of [401, 429, 503]) {
      const server = fakeDevServer()
      const { queue, reads } = queueFor(server)

      queue.add(['1', '2'])
      await server.answer('1', { ok: false, status, error: 'Not now.' })
      expect(server.sent).toEqual(['1'])
      expect(queue.state().queue).toEqual([])
      expect(reads.count).toBe(0)
    }
  })

  it('takes a dev server that stopped answering as a failed relist', async () => {
    const server = fakeDevServer()
    const { queue, reads } = queueFor(server)

    queue.add(['1', '2'])
    await server.hangUp('1')
    expect(server.sent).toEqual(['1'])
    expect(queue.state().errors).toEqual({ '1': 'The dev server stopped answering mid-relist. Refresh to see where it got to.' })
    expect(reads.count).toBe(1)
  })

  it('stops the relists still waiting and lets the one under way finish', async () => {
    const server = fakeDevServer()
    const { queue, reads } = queueFor(server)

    queue.add(['1', '2', '3'])
    queue.stop()
    expect(queue.state().queue).toEqual(['1'])

    await server.answer('1')
    expect(server.sent).toEqual(['1'])
    expect(queue.state()).toEqual({ queue: [], done: ['1'], errors: {} })
    expect(reads.count).toBe(1)
  })

  it('clears the error of a listing that is queued again', async () => {
    const server = fakeDevServer()
    const { queue } = queueFor(server)

    queue.add(['1'])
    await server.answer('1', { ok: false, status: 500, error: 'The upload failed.' })
    queue.add(['1'])
    expect(queue.state().errors).toEqual({})
  })

  it('keeps a relisted listing marked while a read still lists it', async () => {
    const server = fakeDevServer()
    const { queue } = queueFor(server)

    queue.add(['1', '2'])
    await server.answer('1')
    await server.answer('2')

    // A read that set off before the second relist was done still has its old listing.
    queue.listRead(['2', '9'])
    expect(queue.state().done).toEqual(['2'])
    queue.listRead(['9', '10'])
    expect(queue.state().done).toEqual([])
  })

  it('hands out the same state until something changes, and says when it does', () => {
    const server = fakeDevServer()
    const { queue } = queueFor(server)
    let changes = 0
    const unsubscribe = queue.subscribe(() => {
      changes += 1
    })

    const idle = queue.state()
    queue.stop()
    queue.clearErrors()
    queue.listRead([])
    queue.add([])
    expect(queue.state()).toBe(idle)
    expect(changes).toBe(0)

    queue.add(['1'])
    expect(queue.state()).not.toBe(idle)
    expect(changes).toBe(1)

    unsubscribe()
    queue.add(['2'])
    expect(changes).toBe(1)
  })
})
