import { describe, expect, it } from 'vitest'
import { createPacer } from '~/services/deal-finder/scan'

const DELAY = 30

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('createPacer', () => {
  it('runs the first request to a site straight away and spaces the ones behind it', async () => {
    const pace = createPacer()
    const at: number[] = []
    const start = Date.now()
    const request = () =>
      pace('https://www.cardmarket.com/en/Pokemon', DELAY, async () => {
        at.push(Date.now() - start)
      })

    await Promise.all([request(), request(), request()])

    expect(at).toHaveLength(3)
    expect(at[0]).toBeLessThan(DELAY)
    expect(at[1]).toBeGreaterThanOrEqual(DELAY)
    expect(at[2]).toBeGreaterThanOrEqual(DELAY * 2)
  })

  it('measures the pause from the end of the request before it, not its start', async () => {
    const pace = createPacer()
    const start = Date.now()

    await pace('https://www.google.com/search?q=a', DELAY, () => sleep(DELAY * 2))
    await pace('https://www.google.com/search?q=b', DELAY, async () => undefined)

    // The slow first request plus the pause, rather than the pause swallowing it.
    expect(Date.now() - start).toBeGreaterThanOrEqual(DELAY * 3)
  })

  it('never makes one site wait for another', async () => {
    const pace = createPacer()
    const start = Date.now()

    await pace('https://www.marktplaats.nl/lrp/api/search', DELAY, () => sleep(DELAY * 2))
    await pace('https://www.vinted.nl/catalog', DELAY, async () => undefined)

    expect(Date.now() - start).toBeLessThan(DELAY * 3)
  })

  it('lets the queue carry on after a request fails', async () => {
    const pace = createPacer()
    const url = 'https://www.cardmarket.com/en/Pokemon'

    await expect(pace(url, DELAY, () => Promise.reject(new Error('Cardmarket blocked the page (bot check).')))).rejects.toThrow('bot check')
    await expect(pace(url, DELAY, async () => 'the next card')).resolves.toBe('the next card')
  })

  it('treats anything it cannot read as a host of its own rather than throwing', async () => {
    const pace = createPacer()
    await expect(pace('not a url', DELAY, async () => 'ran anyway')).resolves.toBe('ran anyway')
  })
})
