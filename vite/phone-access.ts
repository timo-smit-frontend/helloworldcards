import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import type { Plugin } from 'vite'
import { createSessionToken, SESSION_COOKIE } from '../worker/session'

/**
 * The admin on a phone, through Tailscale.
 *
 * The Vinted relist drives the Chrome window on this computer, so it can only ever run
 * here; a phone needs a way in, not a copy. Tailscale (free for personal use) puts this
 * computer and the phone on a private network of their own, and its Serve feature
 * gives the dev server an HTTPS address on it that works over Wi-Fi and 4G alike —
 * without the dev server ever facing the internet, or even the Wi-Fi around it.
 *
 * Nothing here is a step to remember: once Tailscale is signed in on both devices, the
 * dev server points Serve at itself when it starts and prints the phone's link, and the
 * admin skips its sign-in for your own tailnet. `HWC_PHONE_ACCESS=0` turns it off.
 */

const LOG = '[phone]'

/** The Mac app keeps its command-line tool inside the bundle; Homebrew, Linux and Windows put `tailscale` on the PATH. */
const MAC_APP_CLI = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'

/** Where the phone link lands: the admin's relist screen, the reason the link exists. */
const PHONE_PATH = '/admin/vinted-relist'

/** How often to look again while Tailscale is missing, signed out, or not serving yet. It asks only this computer. */
const RECHECK_MS = 60_000

const CLI_TIMEOUT_MS = 10_000

export function phoneAccessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HWC_PHONE_ACCESS !== '0' && !env.VITEST
}

/** What Serve should pass the phone's requests on to. The dev server only listens on this computer. */
export function serveTarget(port: number): string {
  return `http://127.0.0.1:${port}`
}

/** This computer's name on the tailnet (`timos-macbook.tail1234.ts.net`), or null while Tailscale is not connected. */
export function tailnetHost(statusJson: string): string | null {
  try {
    const status = JSON.parse(statusJson) as { BackendState?: string; Self?: { DNSName?: string } }
    if (status.BackendState !== 'Running') {
      return null
    }
    return status.Self?.DNSName?.replace(/\.$/, '') || null
  } catch {
    return null
  }
}

/** Whether Serve already passes `https://<host>/` on to `target`. */
export function servesTarget(serveStatusJson: string, host: string, target: string): boolean {
  try {
    const config = JSON.parse(serveStatusJson) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> }
    const proxy = config.Web?.[`${host}:443`]?.Handlers?.['/']?.Proxy
    return proxy?.replace(/\/$/, '') === target
  } catch {
    return false
  }
}

/** The page Tailscale asks for when Serve is not switched on for the tailnet yet. */
export function enableLink(output: string): string | null {
  return output.match(/https:\/\/login\.tailscale\.com\/\S+/)?.[0] ?? null
}

/**
 * The `Cookie` header a request from your own tailnet goes on with: the one it came
 * with, plus a fresh admin session — so the phone opens the admin without a sign-in.
 * Null for every other request, which signs in as before.
 *
 * Serve adds the Tailscale account a request came from as `Tailscale-User-Login`, and
 * drops any such header the request itself brought along, so it cannot be faked from
 * outside; a request through Funnel (Serve's public side) never has one. Only this
 * computer can reach the dev server without Serve, and it holds `.dev.vars` anyway.
 */
export async function tailnetSessionCookie(
  headers: { host?: string; cookie?: string; 'tailscale-user-login'?: string | string[] },
  env: { DASHBOARD_USERNAME?: string; DASHBOARD_SESSION_SECRET?: string }
): Promise<string | null> {
  const host = headers.host?.replace(/:\d+$/, '') ?? ''
  if (!host.endsWith('.ts.net') || !headers['tailscale-user-login'] || !env.DASHBOARD_USERNAME || !env.DASHBOARD_SESSION_SECRET) {
    return null
  }
  const token = await createSessionToken(env.DASHBOARD_SESSION_SECRET, env.DASHBOARD_USERNAME)
  const others = (headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${SESSION_COOKIE}=`))
  return [...others, `${SESSION_COOKIE}=${token}`].join('; ')
}

export function phoneUrl(host: string): string {
  return `https://${host}${PHONE_PATH}`
}

/** A running `tailscale serve`, which waits for as long as Serve is not switched on for the tailnet. */
export type ServeRun = {
  /** The exit code, or null when it was stopped. */
  done: Promise<number | null>
  stop(): void
}

export type TailscaleCli = {
  /** Run a command and answer with what it printed; a command that failed still answers with its output. */
  run(args: string[]): Promise<string>
  /** Start a command that may wait, passing on everything it prints. */
  start(args: string[], onOutput: (text: string) => void): ServeRun
}

function tailscaleCli(command: string): TailscaleCli {
  return {
    run: (args) =>
      new Promise((resolve) => {
        execFile(command, args, { timeout: CLI_TIMEOUT_MS }, (_error, stdout) => resolve(String(stdout ?? '')))
      }),
    start(args, onOutput) {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', (chunk: Buffer) => onOutput(chunk.toString()))
      child.stderr.on('data', (chunk: Buffer) => onOutput(chunk.toString()))
      let stopped = false
      return {
        done: new Promise((resolve) => {
          child.once('error', () => resolve(stopped ? null : 1))
          child.once('exit', (code) => resolve(stopped ? null : code))
        }),
        stop() {
          stopped = true
          child.kill()
        }
      }
    }
  }
}

/** `tailscale` on the PATH, else the Mac app's own copy, else null when Tailscale is not installed. */
export async function findTailscale(): Promise<TailscaleCli | null> {
  const onPath = await new Promise<boolean>((resolve) => {
    execFile('tailscale', ['version'], { timeout: CLI_TIMEOUT_MS }, (error) => resolve(!error))
  })
  if (onPath) {
    return tailscaleCli('tailscale')
  }
  if (process.platform === 'darwin' && fs.existsSync(MAC_APP_CLI)) {
    return tailscaleCli(MAC_APP_CLI)
  }
  return null
}

/**
 * Keep this computer awake for as long as the dev server runs, locked or not, on the
 * charger or on battery: a sleeping Mac is gone from the tailnet, and the phone link with
 * it. On battery it used to sleep a minute after the screen was locked, halfway through
 * a batch of relists started from the phone.
 *
 * `-i` holds off idle sleep on battery as well as on the charger; `-s` adds the stronger
 * hold macOS only honours on the charger. The display still turns off. Closing the lid
 * still puts the Mac to sleep.
 */
export function keepMacAwake(): () => void {
  if (process.platform !== 'darwin') {
    return () => undefined
  }
  const child = spawn('caffeinate', ['-i', '-s', '-w', String(process.pid)], { stdio: 'ignore' })
  child.once('error', () => undefined)
  child.unref()
  return () => {
    child.kill()
  }
}

type State = 'missing' | 'offline' | 'enabling' | 'failed' | 'serving'

export type PhoneAccess = {
  /** Look now, and again every minute until the phone link is up. */
  start(): void
  /** Look once; resolves when that look is done. */
  check(): Promise<void>
  stop(): void
}

export function createPhoneAccess({
  port,
  tailscale = findTailscale,
  keepAwake = keepMacAwake,
  log = (line: string) => console.info(`${LOG} ${line}`),
  recheckMs = RECHECK_MS
}: {
  port: number
  tailscale?: () => Promise<TailscaleCli | null>
  keepAwake?: () => () => void
  log?: (line: string) => void
  recheckMs?: number
}): PhoneAccess {
  const target = serveTarget(port)
  let state: State | null = null
  let failure = ''
  let serving: ServeRun | null = null
  let awake: (() => void) | null = null
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  let checking: Promise<void> | null = null

  /** Say what changed, once: the check runs every minute and the log should not. */
  function settle(next: State, line: string) {
    if (state !== next) {
      log(line)
    }
    state = next
  }

  function serve(cli: TailscaleCli) {
    let output = ''
    const run = cli.start(['serve', '--bg', '--https=443', target], (text) => {
      output += text
      const link = enableLink(output)
      if (link) {
        settle('enabling', `Tailscale needs HTTPS switched on for your tailnet before the phone link works. Do it once here: ${link}`)
      }
    })
    serving = run
    void run.done.then((code) => {
      if (serving !== run) {
        return
      }
      serving = null
      if (stopped || code == null) {
        return
      }
      if (code !== 0) {
        const reason = output.trim().split('\n').pop() || `tailscale serve stopped with code ${code}`
        if (state !== 'failed' || failure !== reason) {
          log(`Tailscale could not give the dev server an address for your phone: ${reason}`)
        }
        state = 'failed'
        failure = reason
        return
      }
      void check()
    })
  }

  async function look() {
    const cli = await tailscale()
    if (stopped) {
      return
    }
    if (!cli) {
      settle(
        'missing',
        'Install Tailscale (free) on this computer and your phone, signed in to the same account, to open the admin on your phone.'
      )
      return
    }
    const host = tailnetHost(await cli.run(['status', '--json']))
    if (stopped) {
      return
    }
    if (!host) {
      settle('offline', 'Tailscale is not connected on this computer, so the admin cannot be opened on your phone.')
      return
    }
    if (servesTarget(await cli.run(['serve', 'status', '--json']), host, target)) {
      if (stopped) {
        return
      }
      settle('serving', `Vinted relist on your phone: ${phoneUrl(host)}`)
      awake ??= keepAwake()
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      return
    }
    if (!stopped && !serving) {
      serve(cli)
    }
  }

  function check(): Promise<void> {
    checking ??= look()
      .catch((error: unknown) => {
        log(`Could not ask Tailscale about the phone link: ${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        checking = null
      })
    return checking
  }

  return {
    start() {
      void check()
      timer = setInterval(() => void check(), recheckMs)
      timer.unref()
    },
    check,
    stop() {
      stopped = true
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      serving?.stop()
      serving = null
      awake?.()
      awake = null
    }
  }
}

export function phoneAccessPlugin(): Plugin {
  return {
    name: 'phone-access',
    apply: 'serve',
    configureServer(server) {
      const http = server.httpServer
      // `vite-node` boots a server of its own for every `npm run cms:*` command and never
      // has it listen; only the dev server that serves gets a phone link.
      if (!http || server.config.server.middlewareMode || !phoneAccessEnabled()) {
        return
      }
      http.once('listening', () => {
        const address = http.address()
        if (!address || typeof address === 'string') {
          return
        }
        const access = createPhoneAccess({ port: address.port })
        access.start()
        http.once('close', () => access.stop())
      })
    }
  }
}
