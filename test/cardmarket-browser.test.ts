import { afterEach, describe, expect, it } from 'vitest'
import {
  chromeLaunchArgs,
  closeScanBrowser,
  fetchVintedPage,
  getScanBrowser,
  isVintedHost,
  nextChromeAction,
  resetScanBrowser,
  type ScanBrowser
} from '../vite/cardmarket-browser'

afterEach(() => {
  resetScanBrowser()
})

function fakeBrowser(onClose: () => void = () => undefined): ScanBrowser {
  let open = true
  return {
    openTab: async () => ({
      fetchPage: async () => '',
      resolveUrl: async () => null,
      sellerReviews: async () => null,
      close: async () => undefined
    }),
    openPage: async () => ({}) as never,
    isOpen: () => open,
    close: async () => {
      open = false
      onClose()
    }
  }
}

describe('getScanBrowser', () => {
  it('reuses the already-activated browser instead of launching another', async () => {
    let launches = 0
    const create = async () => {
      launches += 1
      return fakeBrowser()
    }

    const first = await getScanBrowser('.', create)
    const second = await getScanBrowser('.', create)

    expect(launches).toBe(1)
    expect(second).toBe(first)
  })

  it('launches once for two scans that start together', async () => {
    let launches = 0
    let finishLaunch = () => {}
    const create = () =>
      new Promise<ScanBrowser>((resolve) => {
        launches += 1
        finishLaunch = () => resolve(fakeBrowser())
      })

    // Marktplaats and Vinted both ask while Chrome is still coming up.
    const marktplaats = getScanBrowser('.', create)
    const vinted = getScanBrowser('.', create)
    finishLaunch()

    expect(await vinted).toBe(await marktplaats)
    expect(launches).toBe(1)
  })

  it('forgets a launch that failed so the next scan can try again', async () => {
    let launches = 0
    const create = async () => {
      launches += 1
      if (launches === 1) {
        throw new Error('Google Chrome is not installed.')
      }
      return fakeBrowser()
    }

    await expect(getScanBrowser('.', create)).rejects.toThrow('not installed')
    await expect(getScanBrowser('.', create)).resolves.toBeDefined()
    expect(launches).toBe(2)
  })

  it('closes the scan browser when the check is done', async () => {
    let closed = 0
    const create = async () =>
      fakeBrowser(() => {
        closed += 1
      })

    await getScanBrowser('.', create)
    await closeScanBrowser()
    await getScanBrowser('.', create)

    expect(closed).toBe(1)
  })

  it('starts a new window when the shared one was closed by hand', async () => {
    let created = 0
    const create = async () => {
      created += 1
      return fakeBrowser()
    }

    const first = await getScanBrowser('.', create)
    await first.close()
    const second = await getScanBrowser('.', create)

    expect(created).toBe(2)
    expect(second).not.toBe(first)
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
