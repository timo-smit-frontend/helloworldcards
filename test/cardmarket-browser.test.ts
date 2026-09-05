import { afterEach, describe, expect, it } from 'vitest'
import {
  chromeLaunchArgs,
  fetchVintedPage,
  isVintedHost,
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

describe('isVintedHost', () => {
  it('recognises the Vinted domains the scan visits', () => {
    expect(isVintedHost('www.vinted.nl')).toBe(true)
    expect(isVintedHost('vinted.com')).toBe(true)
    expect(isVintedHost('www.marktplaats.nl')).toBe(false)
  })
})

describe('fetchVintedPage', () => {
  it('asks for the page as a browser would, without the automated Chrome profile', async () => {
    let headers: Record<string, string> = {}
    const request = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>
      return { ok: true, status: 200, text: async () => '<html></html>' }
    }) as unknown as typeof fetch

    expect(await fetchVintedPage('https://www.vinted.nl/catalog', request)).toBe('<html></html>')
    expect(headers['user-agent']).toContain('Chrome')
  })

  it('reports a refusal instead of returning an error page as results', async () => {
    const request = (async () => ({ ok: false, status: 403, text: async () => '' })) as unknown as typeof fetch

    await expect(fetchVintedPage('https://www.vinted.nl/catalog', request)).rejects.toThrow('403')
  })
})
