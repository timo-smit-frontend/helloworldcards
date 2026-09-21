import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTabPool } from '../vite/tab-pool'

type Tab = { id: number; closed: boolean; isClosed(): boolean; close(): Promise<void> }

/** A stand-in window: every `open` is a new tab, numbered in the order they were opened. */
function window() {
  const opened: Tab[] = []
  return {
    opened,
    async open(): Promise<Tab> {
      const tab: Tab = {
        id: opened.length + 1,
        closed: false,
        isClosed: () => tab.closed,
        async close() {
          tab.closed = true
        }
      }
      opened.push(tab)
      return tab
    },
    /** The ids of the tabs still open. */
    tabs: () => opened.filter((tab) => !tab.closed).map((tab) => tab.id)
  }
}

/** A gate a job waits at, so the test decides when it finishes. */
function gate() {
  let open: () => void = () => undefined
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.useRealTimers()
})

describe('createTabPool', () => {
  it('runs up to the limit at once, each in a tab of its own, and the rest in arrival order', async () => {
    const pool = createTabPool<Tab>({ limit: 2, afterJob: 'keep' })
    const chrome = window()
    const started: number[] = []
    const gates = [1, 2, 3, 4].map(gate)
    const results = gates.map((each, index) =>
      pool.run(chrome.open, async (tab) => {
        started.push(index + 1)
        const page = await tab()
        await each.opened
        return page.id
      })
    )
    await tick()
    expect(started).toEqual([1, 2])
    expect(pool.size()).toEqual({ running: 2, waiting: 2, idle: 0 })

    // The first to finish hands its slot — and its tab — to the third.
    gates[0].open()
    await tick()
    expect(started).toEqual([1, 2, 3])
    gates[1].open()
    gates[2].open()
    gates[3].open()
    expect(await Promise.all(results)).toEqual([1, 2, 1, 2])
    expect(chrome.opened).toHaveLength(2)
    expect(pool.size()).toEqual({ running: 0, waiting: 0, idle: 2 })
  })

  it('closes a tab once its job is done, unless a job is waiting to take it over', async () => {
    const pool = createTabPool<Tab>({ limit: 2, afterJob: 'close' })
    const chrome = window()
    const gates = [1, 2, 3].map(gate)
    const results = gates.map((each) =>
      pool.run(chrome.open, async (tab) => {
        const page = await tab()
        await each.opened
        return page.id
      })
    )
    await tick()
    // The third is waiting, so the first tab to come free is kept for it.
    gates[0].open()
    await tick()
    expect(chrome.tabs()).toEqual([1, 2])
    // Nothing waits any more: the second closes its tab, and the third its inherited one.
    gates[1].open()
    await tick()
    expect(chrome.tabs()).toEqual([1])
    gates[2].open()
    expect(await Promise.all(results)).toEqual([1, 2, 1])
    expect(chrome.tabs()).toEqual([])
    expect(pool.size()).toEqual({ running: 0, waiting: 0, idle: 0 })
  })

  it('keeps a tab for the linger after its job, for a job that arrives meanwhile, and closes it after', async () => {
    vi.useFakeTimers()
    const pool = createTabPool<Tab>({ limit: 2, afterJob: 'close', lingerMs: 1_000 })
    const chrome = window()

    // Nothing is waiting when the first job is done — the next has not arrived — so its
    // tab lingers, and the job that arrives within the linger takes it over.
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(1)
    expect(chrome.tabs()).toEqual([1])
    expect(pool.size()).toEqual({ running: 0, waiting: 0, idle: 1 })
    await vi.advanceTimersByTimeAsync(900)
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(1)
    expect(chrome.opened).toHaveLength(1)

    // The linger starts over from the second job; a job that arrives too late opens a fresh tab.
    await vi.advanceTimersByTimeAsync(900)
    expect(chrome.tabs()).toEqual([1])
    await vi.advanceTimersByTimeAsync(100)
    expect(chrome.tabs()).toEqual([])
    expect(pool.size()).toEqual({ running: 0, waiting: 0, idle: 0 })
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(2)
  })

  it('closes each lingering tab as its own time is up, the oldest first', async () => {
    vi.useFakeTimers()
    const pool = createTabPool<Tab>({ limit: 2, afterJob: 'close', lingerMs: 1_000 })
    const chrome = window()
    const gates = [1, 2].map(gate)
    const results = gates.map((each) =>
      pool.run(chrome.open, async (tab) => {
        const page = await tab()
        await each.opened
        return page.id
      })
    )
    await vi.advanceTimersByTimeAsync(0)
    gates[0].open()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(400)
    gates[1].open()
    expect(await Promise.all(results)).toEqual([1, 2])
    expect(chrome.tabs()).toEqual([1, 2])

    await vi.advanceTimersByTimeAsync(600)
    expect(chrome.tabs()).toEqual([2])
    // A job arriving now gets the tab that is still there, not a fresh one.
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(chrome.tabs()).toEqual([])
    expect(chrome.opened).toHaveLength(2)
  })

  it('does not close a lingering tab while a job is waiting for a slot', async () => {
    vi.useFakeTimers()
    const pool = createTabPool<Tab>({ limit: 1, afterJob: 'close', lingerMs: 1_000 })
    const chrome = window()
    // The first job's tab lingers; the second runs without asking for a tab and holds
    // the only slot, so the third waits — and the tab is kept for it, linger or not.
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(1)
    const second = gate()
    const two = pool.run(chrome.open, async () => {
      await second.opened
    })
    const three = pool.run(chrome.open, async (tab) => (await tab()).id)
    await vi.advanceTimersByTimeAsync(0)
    expect(pool.size()).toEqual({ running: 1, waiting: 1, idle: 1 })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(chrome.tabs()).toEqual([1])
    second.open()
    await two
    expect(await three).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(chrome.tabs()).toEqual([])
  })

  it('closes a tab kept for a waiting job that turned out not to want one', async () => {
    const pool = createTabPool<Tab>({ limit: 1, afterJob: 'close' })
    const chrome = window()
    const first = gate()
    const one = pool.run(chrome.open, async (tab) => {
      await tab()
      await first.opened
    })
    // Waiting, and once it runs it fails before asking for its tab — as a relist does
    // when another tab found Vinted logged out meanwhile.
    const two = pool.run(chrome.open, async () => {
      throw new Error('Vinted is not logged in.')
    })
    await tick()
    first.open()
    await one
    await expect(two).rejects.toThrow('not logged in')
    expect(chrome.tabs()).toEqual([])
  })

  it('opens a tab only when a job asks for one, and keeps it for the next', async () => {
    const pool = createTabPool<Tab>({ limit: 1, afterJob: 'keep' })
    const chrome = window()
    expect(await pool.run(chrome.open, async () => 'no tab needed')).toBe('no tab needed')
    expect(chrome.opened).toHaveLength(0)
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(1)
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(1)
    expect(chrome.opened).toHaveLength(1)
  })

  it('drops a tab that was closed meanwhile and opens a fresh one', async () => {
    const pool = createTabPool<Tab>({ limit: 1, afterJob: 'keep' })
    const chrome = window()
    await pool.run(chrome.open, async (tab) => (await tab()).id)
    chrome.opened[0].closed = true
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(2)
    expect(chrome.opened).toHaveLength(2)
  })

  it('leaves the tab of a job that failed as it is, for what it shows, and gives the next job a fresh one', async () => {
    const pool = createTabPool<Tab>({ limit: 1, afterJob: 'close' })
    const chrome = window()
    await expect(
      pool.run(chrome.open, async (tab) => {
        await tab()
        throw new Error('Vinted did not open a confirmation after "Verwijderen".')
      })
    ).rejects.toThrow('Verwijderen')
    expect(pool.size()).toEqual({ running: 0, waiting: 0, idle: 0 })
    expect(chrome.tabs()).toEqual([1])
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(2)
    expect(chrome.tabs()).toEqual([1])
  })

  it('keeps the tab of a job that failed when tabs are kept anyway', async () => {
    const pool = createTabPool<Tab>({ limit: 1, afterJob: 'keep' })
    const chrome = window()
    await expect(
      pool.run(chrome.open, async (tab) => {
        await tab()
        throw new Error('Vinted is not logged in.')
      })
    ).rejects.toThrow('not logged in')
    // The next job finds the same tab, on the login page.
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(1)
  })

  it('frees the slot when the tab could not be opened', async () => {
    const pool = createTabPool<Tab>({ limit: 1, afterJob: 'close' })
    const open = async (): Promise<Tab> => {
      throw new Error('Google Chrome is not installed.')
    }
    await expect(pool.run(open, async (tab) => (await tab()).id)).rejects.toThrow('Google Chrome is not installed.')
    expect(pool.size()).toEqual({ running: 0, waiting: 0, idle: 0 })
    const chrome = window()
    expect(await pool.run(chrome.open, async (tab) => (await tab()).id)).toBe(1)
  })
})
