import { afterEach, describe, expect, it } from 'vitest'
import {
  chromeLaunchArgs,
  closePlaywrightCardmarketFetcher,
  getPlaywrightCardmarketFetcher,
  nextChromeAction,
  resetPlaywrightCardmarketFetcher
} from '../vite/cardmarket-browser'

afterEach(() => {
  resetPlaywrightCardmarketFetcher()
})

describe('getPlaywrightCardmarketFetcher', () => {
  it('reuses the already-activated browser instead of launching another', async () => {
    let launches = 0
    const create = async () => {
      launches += 1
      return {
        fetchPage: async () => '',
        close: async () => undefined
      }
    }

    const first = await getPlaywrightCardmarketFetcher('.', create)
    const second = await getPlaywrightCardmarketFetcher('.', create)

    expect(launches).toBe(1)
    expect(second).toBe(first)
  })

  it('closes the scan browser when the check is done', async () => {
    let closed = 0
    const create = async () => ({
      fetchPage: async () => '',
      close: async () => {
        closed += 1
      }
    })

    await getPlaywrightCardmarketFetcher('.', create)
    await closePlaywrightCardmarketFetcher()
    await getPlaywrightCardmarketFetcher('.', create)

    expect(closed).toBe(1)
  })
})

describe('nextChromeAction', () => {
  it('connects to the already-open Chrome when CDP is available', () => {
    expect(nextChromeAction({ cdpReady: true, chromeRunning: true })).toBe('connect')
  })

  it('launches a separate Chrome profile when CDP is not available', () => {
    expect(nextChromeAction({ cdpReady: false, chromeRunning: true })).toBe('launch')
    expect(nextChromeAction({ cdpReady: false, chromeRunning: false })).toBe('launch')
    expect(chromeLaunchArgs(9333, '/tmp/cardmarket-chrome')).toEqual([
      '--remote-debugging-port=9333',
      '--user-data-dir=/tmp/cardmarket-chrome',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled'
    ])
  })
})
