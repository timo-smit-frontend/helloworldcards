import fs from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { parseDotEnv } from './dotenv'

/**
 * The Cardmarket account the scans read offers as.
 *
 * Cardmarket stopped showing more than the first page of offers to visitors: "Show more"
 * became "Login to see more offers". A slab usually sits well down the list, and the
 * Price suggestions board wants every row, so both scans need a logged-in session.
 *
 * The session is the scan Chrome profile's, like a cleared bot check, so a login holds
 * for every tab and every scan after it until Cardmarket ends it.
 */
export type CardmarketCredentials = { login: string; password: string }

/** Raised when the account would not log in, or there is no account to log in with. */
export class CardmarketLoginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardmarketLoginError'
  }
}

function readEnvFile(filePath: string): Record<string, string> {
  try {
    return parseDotEnv(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

/**
 * `CM_LOGIN` and `CM_PASS`, from the environment, `.env` or `.dev.vars`.
 *
 * Read again every time they are wanted, so credentials added or corrected while the
 * dev server runs are used by the next scan without a restart.
 */
export function readCardmarketCredentials(root = process.cwd()): CardmarketCredentials | null {
  const files = ['.env', '.dev.vars'].map((name) => readEnvFile(path.join(root, name)))
  const pick = (key: string) => process.env[key]?.trim() || files.map((file) => file[key]?.trim()).find(Boolean)
  const login = pick('CM_LOGIN')
  const password = pick('CM_PASS')
  return login && password ? { login, password } : null
}

/** "Login to see more offers", as a pattern source a page script can rebuild. */
export const OFFERS_LOGIN_WALL = 'log\\s*-?in to see more'

/** Whether this text is Cardmarket holding the rest of an offers list back for a login. */
export function isOffersLoginWall(text: string): boolean {
  return new RegExp(OFFERS_LOGIN_WALL, 'i').test(text)
}

function isCardmarketPage(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && /(?:^|\.)cardmarket\.com$/i.test(hostname)
  } catch {
    return false
  }
}

type SessionState = 'in' | 'out'

/**
 * Logged in or out, from the page in front of us.
 *
 * A logout control settles it. Without one, a password field or a link to the login
 * page means the header is offering a login; a page with neither has nothing to log in
 * with and is taken as logged in.
 */
async function sessionState(page: Page): Promise<SessionState> {
  return await page
    .evaluate(() => {
      if (document.querySelector('a[href*="Logout" i], form[action*="Logout" i]')) {
        return 'in' as const
      }
      if (document.querySelector('input[type="password"]')) {
        return 'out' as const
      }
      return document.querySelector('a[href*="/Login" i]') ? ('out' as const) : ('in' as const)
    })
    .catch(() => 'in' as const)
}

/** Settles the page after a navigation: Cardmarket's bot check, waited out for a human to tick. */
type Settle = (page: Page) => Promise<void>

const LOAD_TIMEOUT_MS = 25_000

/**
 * Fill in the page's login form and send it. False when the page has no form to fill.
 *
 * The values are set on the fields rather than typed: Cardmarket keeps its header form
 * in a dropdown that is closed until clicked, and a closed dropdown has no visible field
 * for a click or a keystroke to reach.
 */
async function submitLoginForm(page: Page, credentials: CardmarketCredentials): Promise<boolean> {
  const navigated = page
    .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false)

  const submitted = await page
    .evaluate(({ login, password }) => {
      const passwordField = document.querySelector<HTMLInputElement>('form input[type="password"]')
      const form = passwordField?.form
      const loginField = form?.querySelector<HTMLInputElement>('input[name="username" i], input[type="email"], input[type="text"]')
      if (!form || !passwordField || !loginField) {
        return false
      }
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      for (const [field, value] of [
        [loginField, login],
        [passwordField, password]
      ] as const) {
        setValue?.call(field, value)
        field.dispatchEvent(new Event('input', { bubbles: true }))
        field.dispatchEvent(new Event('change', { bubbles: true }))
      }
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit()
      } else {
        form.submit()
      }
      return true
    }, credentials)
    // The form posting away takes the page's script context with it mid-call.
    .catch(() => true)

  if (submitted) {
    await navigated
  }
  return submitted
}

/** The login page the header links to, for a page that has no form of its own. */
async function openLoginPage(page: Page, settle: Settle): Promise<boolean> {
  const href = await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href*="/Login" i]')?.href ?? null).catch(() => null)
  if (!href || !isCardmarketPage(href)) {
    return false
  }
  const loaded = await page
    .goto(href, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false)
  if (loaded) {
    await settle(page)
  }
  return loaded
}

/**
 * How long a login that did not go through is left for someone at the Chrome window.
 * A check on the login form itself, or a confirmation Cardmarket asks for, is theirs to
 * answer, the same as the bot check is.
 */
const HAND_LOGIN_WAIT_MS = 90_000

async function waitForHandLogin(page: Page): Promise<boolean> {
  const deadline = Date.now() + HAND_LOGIN_WAIT_MS
  while (Date.now() < deadline) {
    if ((await sessionState(page)) === 'in') {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return false
}

async function logIn(page: Page, credentials: CardmarketCredentials, settle: Settle): Promise<void> {
  let submitted = await submitLoginForm(page, credentials)
  if (!submitted && (await openLoginPage(page, settle))) {
    submitted = await submitLoginForm(page, credentials)
  }
  if (submitted) {
    await settle(page)
    if ((await sessionState(page)) === 'in') {
      console.info('[cardmarket-login] Logged in to Cardmarket')
      return
    }
  }

  console.info('[cardmarket-login] The Cardmarket login did not go through, finish it in the Chrome window')
  await page.bringToFront().catch(() => undefined)
  if (await waitForHandLogin(page)) {
    console.info('[cardmarket-login] Logged in to Cardmarket')
    return
  }
  throw new CardmarketLoginError(
    `Could not log in to Cardmarket as ${credentials.login}. Check CM_LOGIN and CM_PASS in .env, or log in once in the scan's Chrome window.`
  )
}

/**
 * The login in progress, shared by every tab: the Marktplaats and Vinted scans run side
 * by side, and both meeting the login wall at once must not log in twice.
 */
let pending: Promise<void> | null = null

/**
 * The credentials that last failed to log in. Trying the same wrong password on every
 * card of a scan is how an account gets locked, so they are not tried again until
 * `.env` holds something else.
 */
let failedWith: string | null = null

function credentialKey({ login, password }: CardmarketCredentials): string {
  return `${login}\n${password}`
}

let warnedMissing = false

/**
 * Make sure the scan Chrome is logged in to Cardmarket, logging in on `page` if not.
 *
 * `required` is for a page that has already been held back by the login wall: without an
 * account that is an error, where a warmup without one only says so and goes on — the
 * first page of offers is still there, and often enough.
 */
export async function ensureCardmarketLogin(
  page: Page,
  { root = process.cwd(), settle, required = false }: { root?: string; settle: Settle; required?: boolean }
): Promise<void> {
  if (pending) {
    await pending
    return
  }
  if (!isCardmarketPage(page.url()) || (!required && (await sessionState(page)) === 'in')) {
    return
  }

  const credentials = readCardmarketCredentials(root)
  if (!credentials) {
    if (required) {
      throw new CardmarketLoginError('Cardmarket only shows more offers when logged in. Add CM_LOGIN and CM_PASS to .env.')
    }
    if (!warnedMissing) {
      warnedMissing = true
      console.info('[cardmarket-login] No CM_LOGIN / CM_PASS in .env, so Cardmarket shows only its first page of offers')
    }
    return
  }
  if (failedWith === credentialKey(credentials) && (await sessionState(page)) === 'out') {
    throw new CardmarketLoginError(
      `Cardmarket would not log in as ${credentials.login} earlier. Correct CM_LOGIN and CM_PASS in .env and scan again.`
    )
  }

  const attempt = logIn(page, credentials, settle).then(
    () => {
      failedWith = null
    },
    (error: unknown) => {
      failedWith = credentialKey(credentials)
      throw error
    }
  )
  pending = attempt
  try {
    await attempt
  } finally {
    if (pending === attempt) {
      pending = null
    }
  }
}

export function resetCardmarketLogin() {
  pending = null
  failedWith = null
  warnedMissing = false
}
