import { describe, expect, it } from 'vitest'
import {
  createPhoneAccess,
  enableLink,
  phoneAccessEnabled,
  servesTarget,
  tailnetHost,
  tailnetSessionCookie,
  type ServeRun,
  type TailscaleCli
} from '../vite/phone-access'
import { readCookie, SESSION_COOKIE, verifySessionToken } from '../worker/session'

const HOST = 'timos-macbook.tail1234.ts.net'
const RUNNING = JSON.stringify({ BackendState: 'Running', Self: { DNSName: `${HOST}.` } })

function serveConfig(proxy: string) {
  return JSON.stringify({ TCP: { 443: { HTTPS: true } }, Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: proxy } } } } })
}

/**
 * A stand-in `tailscale`: `status` and `serve status` answer from `answers`, and a
 * `serve --bg` waits until the test lets it finish.
 */
function fakeTailscale(answers: { status: string; serve: string }) {
  const started: string[][] = []
  let print: (text: string) => void = () => undefined
  let finish: (code: number | null) => void = () => undefined
  const cli: TailscaleCli = {
    async run(args) {
      return args[0] === 'status' ? answers.status : answers.serve
    },
    start(args, onOutput): ServeRun {
      started.push(args)
      print = onOutput
      return {
        done: new Promise((resolve) => {
          finish = resolve
        }),
        stop: () => finish(null)
      }
    }
  }
  return { cli, started, answers, print: (text: string) => print(text), finish: (code: number | null) => finish(code) }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(tailscale: TailscaleCli | null) {
  const lines: string[] = []
  let awake = 0
  const access = createPhoneAccess({
    port: 5173,
    tailscale: async () => tailscale,
    keepAwake: () => {
      awake += 1
      return () => {
        awake -= 1
      }
    },
    log: (line) => lines.push(line)
  })
  return { access, lines, awake: () => awake }
}

describe('reading Tailscale', () => {
  it('knows this computer by its tailnet name while Tailscale is connected', () => {
    expect(tailnetHost(RUNNING)).toBe(HOST)
    expect(tailnetHost(JSON.stringify({ BackendState: 'NeedsLogin', Self: { DNSName: `${HOST}.` } }))).toBeNull()
    expect(tailnetHost('')).toBeNull()
  })

  it('sees whether Serve already passes the tailnet address on to the dev server', () => {
    expect(servesTarget(serveConfig('http://127.0.0.1:5173'), HOST, 'http://127.0.0.1:5173')).toBe(true)
    expect(servesTarget(serveConfig('http://127.0.0.1:5173/'), HOST, 'http://127.0.0.1:5173')).toBe(true)
    // Last time the dev server had to take the next port.
    expect(servesTarget(serveConfig('http://127.0.0.1:5174'), HOST, 'http://127.0.0.1:5173')).toBe(false)
    expect(servesTarget('{}', HOST, 'http://127.0.0.1:5173')).toBe(false)
    expect(servesTarget('', HOST, 'http://127.0.0.1:5173')).toBe(false)
  })

  it('finds the page Tailscale asks for when Serve is not switched on yet', () => {
    const output = 'Serve is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=nABC123\n'
    expect(enableLink(output)).toBe('https://login.tailscale.com/f/serve?node=nABC123')
    expect(enableLink('Available within your tailnet:')).toBeNull()
  })

  it('stays out of test runs and can be turned off', () => {
    expect(phoneAccessEnabled({})).toBe(true)
    expect(phoneAccessEnabled({ HWC_PHONE_ACCESS: '0' })).toBe(false)
    expect(phoneAccessEnabled({ VITEST: 'true' })).toBe(false)
  })
})

describe('the phone link', () => {
  it('says once that Tailscale is needed, however often it looks', async () => {
    const { access, lines, awake } = setup(null)
    await access.check()
    await access.check()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Install Tailscale')
    expect(awake()).toBe(0)
  })

  it('says once that Tailscale is signed out', async () => {
    const tailscale = fakeTailscale({ status: JSON.stringify({ BackendState: 'NeedsLogin' }), serve: '{}' })
    const { access, lines } = setup(tailscale.cli)
    await access.check()
    await access.check()
    expect(lines).toEqual(['Tailscale is not connected on this computer, so the admin cannot be opened on your phone.'])
    expect(tailscale.started).toEqual([])
  })

  it('prints the link and keeps the Mac awake when Serve already points here', async () => {
    const tailscale = fakeTailscale({ status: RUNNING, serve: serveConfig('http://127.0.0.1:5173') })
    const { access, lines, awake } = setup(tailscale.cli)
    await access.check()
    await access.check()
    expect(lines).toEqual([`Vinted relist on your phone: https://${HOST}/admin/vinted-relist`])
    expect(tailscale.started).toEqual([])
    expect(awake()).toBe(1)
    access.stop()
    expect(awake()).toBe(0)
  })

  it('points Serve at the dev server, and prints the link once it is serving', async () => {
    const tailscale = fakeTailscale({ status: RUNNING, serve: serveConfig('http://127.0.0.1:5174') })
    const { access, lines, awake } = setup(tailscale.cli)
    await access.check()
    expect(tailscale.started).toEqual([['serve', '--bg', '--https=443', 'http://127.0.0.1:5173']])
    expect(awake()).toBe(0)

    tailscale.answers.serve = serveConfig('http://127.0.0.1:5173')
    tailscale.finish(0)
    await tick()
    await tick()
    expect(lines).toEqual([`Vinted relist on your phone: https://${HOST}/admin/vinted-relist`])
    expect(awake()).toBe(1)
  })

  it('passes on the one-time HTTPS switch, and does not start a second serve while the first waits for it', async () => {
    const tailscale = fakeTailscale({ status: RUNNING, serve: '{}' })
    const { access, lines } = setup(tailscale.cli)
    await access.check()
    tailscale.print('Serve is not enabled on your tailnet.\nTo enable, visit:\n\n   https://login.tailscale.com/f/serve?node=nABC123\n')
    tailscale.print('Waiting...\n')
    await access.check()
    expect(tailscale.started).toHaveLength(1)
    expect(lines).toEqual([
      'Tailscale needs HTTPS switched on for your tailnet before the phone link works. Do it once here: https://login.tailscale.com/f/serve?node=nABC123'
    ])
  })

  it('reports a failed serve once, and tries again on the next look', async () => {
    const tailscale = fakeTailscale({ status: RUNNING, serve: '{}' })
    const { access, lines } = setup(tailscale.cli)
    await access.check()
    tailscale.print('error: access denied\n')
    tailscale.finish(1)
    await tick()
    await access.check()
    expect(tailscale.started).toHaveLength(2)
    tailscale.print('error: access denied\n')
    tailscale.finish(1)
    await tick()
    expect(lines).toEqual(['Tailscale could not give the dev server an address for your phone: error: access denied'])
  })

  it('lets a waiting serve go when the dev server stops', async () => {
    const tailscale = fakeTailscale({ status: RUNNING, serve: '{}' })
    const { access, lines, awake } = setup(tailscale.cli)
    await access.check()
    access.stop()
    await tick()
    expect(lines).toEqual([])
    expect(awake()).toBe(0)
  })
})

describe('signing in from the tailnet', () => {
  const env = { DASHBOARD_USERNAME: 'timo', DASHBOARD_SESSION_SECRET: 'a-long-test-secret' }
  const fromPhone = { host: HOST, 'tailscale-user-login': 'timo@example.com' }

  it('gives a request from your own tailnet a working admin session', async () => {
    const cookie = await tailnetSessionCookie(fromPhone, env)
    const token = readCookie(cookie, SESSION_COOKIE)
    expect(token).not.toBeNull()
    expect(await verifySessionToken(env.DASHBOARD_SESSION_SECRET, token!)).toBe('timo')
  })

  it('keeps the other cookies and replaces an old session', async () => {
    const cookie = await tailnetSessionCookie({ ...fromPhone, cookie: `theme=dark; ${SESSION_COOKIE}=expired` }, env)
    expect(cookie?.startsWith('theme=dark; ')).toBe(true)
    expect(cookie?.split(`${SESSION_COOKIE}=`)).toHaveLength(2)
    expect(readCookie(cookie, SESSION_COOKIE)).not.toBe('expired')
  })

  it('leaves every other request to sign in', async () => {
    // Funnel, Serve's public side, never says who is asking.
    expect(await tailnetSessionCookie({ host: HOST }, env)).toBeNull()
    // Only Serve names the account; on this computer the login stays.
    expect(await tailnetSessionCookie({ host: 'localhost:5173', 'tailscale-user-login': 'timo@example.com' }, env)).toBeNull()
    expect(await tailnetSessionCookie({ host: 'helloworldcards.com', 'tailscale-user-login': 'timo@example.com' }, env)).toBeNull()
    expect(await tailnetSessionCookie(fromPhone, {})).toBeNull()
  })
})
