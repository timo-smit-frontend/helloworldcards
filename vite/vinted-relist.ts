import fs from 'node:fs'
import path from 'node:path'
import type { Frame, Locator, Page, Request as PageRequest, Response as PageResponse } from 'playwright'
import sharp from 'sharp'
import type { InventoryProduct } from '../app/database/products'
import {
  buildRelistReport,
  catalogPathTo,
  cooldownRemainingMs,
  earlierCopy,
  emptyRelistState,
  listingProductLookup,
  listingsWithoutAge,
  normalizeRelistState,
  originalPhotos,
  pageLooksRateLimited,
  parseVintedSnapshot,
  parseVintedUploadedText,
  parseWardrobeItems,
  RATE_LIMIT_COOLDOWN_MS,
  RELIST_TABS,
  relistWaitMs,
  replacementListing,
  settleMissingByHand,
  settlePendingByHand,
  vintedItemId,
  vintedItemUrl,
  vintedPriceInput,
  VintedRelistError,
  wardrobeUploadedAt,
  type OriginalPhotos,
  type VintedCatalogNode,
  type VintedRelistOptions,
  type VintedRelistReport,
  type VintedRelistService,
  type VintedRelistState,
  type VintedSnapshot,
  type VintedWardrobeItem
} from '../app/services/vinted-relist'
import { isVintedHost, keepScanBrowserOpen, waitForBotChallengeClear } from './cardmarket-browser'
import { cachedMediaSource, firstMediaSource, seedMediaSource } from './media-originals'
import type { MediaSourceReader } from './media-sync'
import { createTabPool, type TabPool } from './tab-pool'
import { fileVintedStatsRecorder, type VintedStatsRecorder } from './vinted-stats'

const STATE_FILE = path.join('.cache', 'vinted-relist.json')
const PHOTO_DIR = path.join('.cache', 'vinted-relist')
/** Where a relist that stops leaves what its tab showed, a `.json` and a `.png` per stop. */
const FAILURE_DIR = path.join('.cache', 'vinted-relist-failures')
/** How many of those are kept; the oldest go first. */
const FAILURES_KEPT = 20
const VINTED = 'https://www.vinted.nl'
const LOAD_TIMEOUT_MS = 30_000
/**
 * How long one `fetch` from inside the tab may take. Playwright's `evaluate` has no
 * limit of its own, so a request Vinted never answers used to hang the relist — and
 * the screen's spinner — for good, with the tab sitting on the home page as if
 * nothing had been started.
 */
const IN_PAGE_FETCH_TIMEOUT_MS = 30_000
/** How long the window stays open for someone to log in to Vinted. */
const LOGIN_GRACE_MS = 10 * 60_000
/** Photos upload one by one; a listing of three can take a while on a slow line. */
const PHOTO_UPLOAD_TIMEOUT_MS = 90_000
const PUBLISH_TIMEOUT_MS = 90_000
/**
 * How long the Chrome window stays open after a piece of Vinted work, so the next
 * one finds its tabs already on Vinted. Every fresh tab starts with a page load,
 * and a Vinted page alone asks Vinted's API a dozen things.
 */
const TAB_GRACE_MS = 3 * 60_000
/**
 * How long a relist tab is kept once its relist is done, for a relist that is on its
 * way. The next one is seldom in the queue at that moment even when its button was
 * pressed long before: the admin sends it only once the one before it has answered
 * (`app/admin/relist-queue.ts`), and it reaches the tabs only after the dev server
 * has settled the local database with production — a remote round trip of a good few
 * seconds, at times behind the push the relist just done set off. A tab it finds
 * waiting is on Vinted already and starts at once; a fresh one first goes through
 * Chrome and Vinted's session refresh. A tab nobody has come for by then closes.
 */
const RELIST_TAB_LINGER_MS = 60_000
/** A wardrobe read within this long of the last one is answered from memory. */
const REPORT_TTL_MS = 60_000
/**
 * A session check within this long of the last one is answered from memory. The
 * tabs of one batch start within seconds of each other, and there is one Vinted
 * session in the window whichever tab asks; a batch that starts later asks again.
 */
const SESSION_TTL_MS = 60_000
/**
 * How long a session problem — "not logged in", or a session stuck in Vinted's
 * session refresh — holds for every tab. The relists queued behind the one that
 * found it would otherwise each load a page to find the same, and the tab it left in
 * front is the only one the login needs. Short, so that a login in the window is not
 * waited out.
 */
const SESSION_PROBLEM_TTL_MS = 15_000
/**
 * Relists start this far apart. Starting one is the busiest moment of it — a listing
 * page and everything that page loads — so three starting together would hit Vinted
 * as one burst, where a person opens one page and then another. It also keeps two
 * fresh tabs from renewing the same session at once: Vinted bounces a tab's first
 * visit through its session-refresh page, and tabs that went through it together
 * used to wedge there, every one of them.
 */
const RELIST_START_GAP_MS = 4_000
/** Listing pages are read one at a time, this far apart — as a person would browse. */
const AGE_READ_GAP_MS = 1_000
/** And no more than this many per look at the screen; the rest wait for the next. */
const AGE_READS_PER_REPORT = 24

/**
 * The state file, read and written whole.
 *
 * Relists run side by side, and each writes the file a few times over its minutes
 * of work. A relist that read the state at its start and wrote it back at its end
 * would write over what the others wrote meanwhile — a pending entry lost that way
 * is a listing deleted with no record of what it was. So every write goes through
 * `update`, which reads, changes and writes in one go, with no waiting in between.
 */
type RelistStateStore = {
  get(): VintedRelistState
  update(change: (state: VintedRelistState) => void): VintedRelistState
}

/** The store over a `get`/`put` pair; a test can hand in a pair of its own. */
export function relistStateStore(file: { get(): VintedRelistState; put(state: VintedRelistState): void }): RelistStateStore {
  return {
    get: () => file.get(),
    update(change) {
      const state = file.get()
      change(state)
      file.put(state)
      return state
    }
  }
}

function fileRelistStateStore(root: string): RelistStateStore {
  const filePath = path.join(root, STATE_FILE)
  return relistStateStore({
    get() {
      if (!fs.existsSync(filePath)) {
        return emptyRelistState()
      }
      try {
        return normalizeRelistState(JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<VintedRelistState>)
      } catch {
        return emptyRelistState()
      }
    },
    put(state) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
    }
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type VintedSession = { userId: number; login: string }

/**
 * What the tabs of the one Chrome window share.
 *
 * The window is the seller's Vinted session, and every tab in it is that same
 * session — so what one tab learnt, the next need not ask again: who is logged in,
 * what the wardrobe holds, that Vinted wants a login first. The relist tabs and the
 * tab that reads the wardrobe are pools of their own, so a look at the screen never
 * waits behind a relist. A relist tab lands straight on the page its work needs, so
 * a fresh one costs Vinted nothing a kept one would have saved — which is why the
 * relist tabs go with their relists (a minute after, for a relist on its way), and
 * only the wardrobe tab stays.
 */
type VintedChrome = {
  /**
   * The relist tabs. Each closes a minute after its relist is done — unless a relist
   * is waiting, or arrives within that minute, which takes it over.
   */
  relists: TabPool<Page>
  /** The one tab that reads the wardrobe. It stays: it costs a homepage load to open, and every read is the same. */
  reports: TabPool<Page>
  /** The listings relists are working on right now, by the id they started with. */
  inFlight: Set<string>
  /** The last session check, answered again to anyone who asks within `SESSION_TTL_MS`. */
  session: { at: number; check: Promise<VintedSession> } | null
  /** A session problem found a moment ago, taken as read by every tab until `until`. */
  sessionProblem: { until: number; error: VintedRelistError } | null
  /** The last wardrobe read, answered again to anyone who asks within `REPORT_TTL_MS`. */
  lastWardrobe: { at: number; wardrobe: VintedWardrobeItem[] } | null
  /** Where every wardrobe read is kept, for the views and likes each listing gathered while it was up. */
  stats: VintedStatsRecorder
  /** How far apart relists start, and when the next may. */
  startGapMs: number
  nextStartAt: number
}

/** One window per project, as the scan browser is; a test with a root of its own gets a window of its own. */
const chromeByRoot = new Map<string, VintedChrome>()

function chromeFor(root: string, tabs: number, startGapMs: number, tabLingerMs: number, stats: VintedStatsRecorder): VintedChrome {
  let chrome = chromeByRoot.get(root)
  if (!chrome) {
    chrome = {
      relists: createTabPool({ limit: tabs, afterJob: 'close', lingerMs: tabLingerMs }),
      reports: createTabPool({ limit: 1, afterJob: 'keep' }),
      inFlight: new Set(),
      session: null,
      sessionProblem: null,
      lastWardrobe: null,
      stats,
      startGapMs,
      nextStartAt: 0
    }
    chromeByRoot.set(root, chrome)
  }
  return chrome
}

/** Wait for this relist's turn to start, a gap after the last one's. */
async function spaceOut(chrome: VintedChrome): Promise<void> {
  const at = Math.max(Date.now(), chrome.nextStartAt)
  chrome.nextStartAt = at + chrome.startGapMs
  const wait = at - Date.now()
  if (wait > 0) {
    await sleep(wait)
  }
}

/**
 * Vinted has cut this computer off for asking too much. Thrown from wherever it is
 * noticed — a page, a `fetch` answered 429 — and turned into the cool-down in one place.
 */
class VintedRateLimited extends Error {
  constructor(where: string) {
    super(`Vinted is rate limiting this computer (${where}).`)
    this.name = 'VintedRateLimited'
  }
}

/** A `fetch` from inside a page cannot throw a class of ours; it says this instead. */
const RATE_LIMITED_TEXT = /answered 429\b|rate limit/i

function isRateLimited(error: unknown): boolean {
  if (error instanceof VintedRateLimited) {
    return true
  }
  // A relist that stopped for a cool-down another tab started says so in its own
  // words, and those must not start the cool-down over.
  return error instanceof Error && !(error instanceof VintedRelistError) && RATE_LIMITED_TEXT.test(error.message)
}

/** Throw if the tab is showing Vinted's rate-limit page. */
async function failIfRateLimited(page: Page, where: string): Promise<void> {
  const title = await page.title().catch(() => '')
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 2_000) ?? '').catch(() => '')
  if (pageLooksRateLimited(title, text)) {
    throw new VintedRateLimited(where)
  }
}

/** What Playwright says when the tab went on to another page in the middle of something. */
const MOVED_ON = /execution context was destroyed|interrupted by another navigation|net::ERR_ABORTED/i

/**
 * Do `work` in the tab — and do it again, twice at most, when Vinted took the tab on
 * to another page in the middle of it.
 *
 * Every read of Vinted is a `fetch` from inside the page, and a page that navigates
 * takes its script, with the `fetch` under way, along with it; a page load that
 * another navigation cuts across is dropped just the same. And Vinted moves a tab on
 * by itself: once a listing is deleted it takes the tab off that listing's page,
 * whenever it gets round to it — at a busy moment right in the middle of the read
 * that checks the delete went through, or of the load of the upload form. Relists
 * used to stop there, with Playwright's word about a navigation, their listing
 * already gone. The reads and loads are all GETs, so doing one again once the tab
 * has landed is safe.
 */
async function whileVintedMovesOn<T>(page: Page, work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work()
    } catch (error) {
      if (attempt >= 3 || !(error instanceof Error) || !MOVED_ON.test(error.message)) {
        throw error
      }
      console.info('[vinted-relist] Vinted took the tab to another page meanwhile, going again once it has landed')
      await page.waitForLoadState('domcontentloaded').catch(() => undefined)
    }
  }
}

const SESSION_REFRESH = /\/session-refresh/
/** How long the session-refresh page gets to do its thing before it counts as stuck. */
const SESSION_REFRESH_WAIT_MS = 8_000

/**
 * Go to a Vinted page, and through its session-refresh page when one is in the way.
 *
 * Vinted bounces a visit through `/session-refresh`, which renews its cookies with
 * script and moves on. With a stale `refresh_token_web` it never moves on: the page
 * spins for good, on every URL, until the window's Vinted cookies are cleared and
 * the shop logs in again. The relist does neither: the cookies and the login are
 * the person's at the window, and beyond the relist itself it does as little on
 * Vinted as it can. So a refresh that stays put past any honest one stops the relist,
 * and every tab after it, the way a session that has run out does — with the tab
 * left on the spinning page, in front.
 */
async function gotoVinted(chrome: VintedChrome, page: Page, url: string): Promise<void> {
  await whileVintedMovesOn(page, () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS }))
  await failIfRateLimited(page, url)
  if (!SESSION_REFRESH.test(page.url())) {
    return
  }
  const moved = await page
    .waitForURL((current) => !SESSION_REFRESH.test(current.pathname), { timeout: SESSION_REFRESH_WAIT_MS })
    .then(() => true)
    .catch(() => false)
  if (!moved) {
    await stopForSession(
      chrome,
      page,
      "Vinted's session in the Chrome window is stuck on its session-refresh page. Clear Vinted's cookies there and log in again, then refresh here."
    )
  }
}

/** The session problem a tab found a moment ago, while every tab still takes it as read. */
function knownSessionProblem(chrome: VintedChrome): VintedRelistError | null {
  return chrome.sessionProblem && Date.now() < chrome.sessionProblem.until ? chrome.sessionProblem.error : null
}

/**
 * Stop over a session only the person at the window can put right, and every tab
 * with it for a moment. The window is held open for them, with this tab in front
 * just as it is: the relist goes nowhere on Vinted to help, not even the login page.
 */
async function stopForSession(chrome: VintedChrome, page: Page, message: string): Promise<never> {
  chrome.session = null
  const error = new VintedRelistError(message, 401)
  chrome.sessionProblem = { until: Date.now() + SESSION_PROBLEM_TTL_MS, error }
  keepScanBrowserOpen(LOGIN_GRACE_MS)
  await page.bringToFront().catch(() => undefined)
  throw error
}

/**
 * Land on Vinted in the tab and make sure it is the seller's session.
 *
 * Every read after this is a `fetch` from inside the page, which rides on the
 * session's cookies — so nothing works until the page is actually on vinted.nl and
 * logged in. A fresh tab lands on `landing`: the page its work is going to load
 * anyway, when there is one, rather than the homepage and then that page. A
 * logged-out window is left open so it can be logged in to.
 *
 * The session is the window's, not the tab's, so the check itself is made once and
 * its answer shared: tabs that start together wait for the one check under way.
 */
async function ensureSession(page: Page, chrome: VintedChrome, landing = `${VINTED}/`): Promise<VintedSession> {
  const known = knownSessionProblem(chrome)
  if (known) {
    throw known
  }
  if (!/^https:\/\/www\.vinted\.nl\//.test(page.url()) || SESSION_REFRESH.test(page.url())) {
    await gotoVinted(chrome, page, landing)
  }
  // The tab may have been left on the rate-limit page by the last piece of work.
  await failIfRateLimited(page, page.url())
  const cleared = await waitForBotChallengeClear(page, 'Vinted')
  if (!cleared) {
    keepScanBrowserOpen(LOGIN_GRACE_MS)
    throw new VintedRelistError('Vinted is showing a bot check. Clear it in the Chrome window, then try again.', 503)
  }

  return await sharedSessionCheck(page, chrome)
}

/** The session check under way or just made, whichever tab made it — or a new one, made from this tab. */
async function sharedSessionCheck(page: Page, chrome: VintedChrome): Promise<VintedSession> {
  const fresh = chrome.session && Date.now() - chrome.session.at < SESSION_TTL_MS ? chrome.session : null
  if (fresh) {
    return await fresh.check
  }
  // Another tab may have found Vinted logged out while this one's page was loading.
  const foundMeanwhile = knownSessionProblem(chrome)
  if (foundMeanwhile) {
    throw foundMeanwhile
  }
  const check = checkSession(page, chrome)
  chrome.session = { at: Date.now(), check }
  return await check
}

/**
 * Who the window is logged in as. A window nobody is logged in to is left for the
 * shop to log in to, on the Vinted page the tab is on.
 */
async function checkSession(page: Page, chrome: VintedChrome): Promise<VintedSession> {
  const current = await currentUser(page, chrome)
  if (current) {
    return current
  }
  return await stopForSession(chrome, page, 'Vinted is not logged in. Log in as the shop in the Chrome window, then refresh here.')
}

/** Ask Vinted who the window is logged in as, from this tab; null for nobody. */
async function currentUser(page: Page, chrome: VintedChrome): Promise<VintedSession | null> {
  return await whileVintedMovesOn(page, () =>
    page.evaluate(async (timeout) => {
      const response = await fetch('/api/v2/users/current', {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeout)
      })
      if (response.status === 429) {
        throw new Error('Vinted answered 429 for the current user.')
      }
      if (!response.ok) {
        return null
      }
      const body = (await response.json()) as { user?: { id?: number; login?: string } }
      return body.user?.id && body.user.login ? { userId: body.user.id, login: body.user.login } : null
    }, IN_PAGE_FETCH_TIMEOUT_MS)
  ).catch((error: unknown) => {
    chrome.session = null
    if (isRateLimited(error)) {
      throw error
    }
    return null
  })
}

/**
 * Vinted's cookie banner, answered with only the essential cookies the moment it
 * shows, on whatever page the tab has loaded. Every tab the relist opens runs this
 * in each page it loads; it runs inside the page, so it is plain script that uses
 * nothing from outside it.
 *
 * Vinted shows the banner on every page of a window that has not answered it — one
 * whose cookies were cleared, say. It comes a second or two after the page, over a dark layer that takes
 * every click meant for the page: "Verwijderen" on a listing, the pickers on the
 * upload form. A click from outside would have to find the button, wait out the
 * banner's slide-in and land before anything moves again. From inside the page
 * none of that matters: the banner is answered through OneTrust's own
 * `RejectAll()`, which is what its "Alleen essentiële cookies" button calls, or
 * failing that by that button's own click, which no layer can take.
 */
function answerCookieBannerInPage(): void {
  if (window.top !== window) {
    return
  }
  let answeredAt = 0
  let tries = 0
  const timer = setInterval(() => {
    try {
      const banner = document.getElementById('onetrust-banner-sdk')
      // An answered banner takes a moment to fade out; it is not answered again meanwhile.
      if (!banner || Date.now() - answeredAt < 2_000) {
        return
      }
      const style = getComputedStyle(banner)
      if (banner.getClientRects().length === 0 || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return
      }
      answeredAt = Date.now()
      tries += 1
      if (tries > 6) {
        clearInterval(timer)
        return
      }
      // OneTrust's script first; the button when the script did not take the banner down.
      const oneTrust = (window as unknown as { OneTrust?: { RejectAll?: () => void } }).OneTrust
      if (tries % 2 === 1 && typeof oneTrust?.RejectAll === 'function') {
        oneTrust.RejectAll()
        return
      }
      const reject =
        document.getElementById('onetrust-reject-all-handler') ??
        Array.from(banner.querySelectorAll('button')).find((button) => /essenti|noodzakelijk|weiger|reject/i.test(button.textContent ?? ''))
      reject?.click()
    } catch {
      // Looked at again on the next tick.
    }
  }, 250)
}

/**
 * The wardrobe as Vinted has it now. Every read is kept as the last one, since a
 * read made to check on a delete or find a new listing is as good an answer to the
 * screen's next question as one made for it — and goes into the view and like stats.
 */
async function readWardrobe(page: Page, chrome: VintedChrome, { userId }: VintedSession): Promise<VintedWardrobeItem[]> {
  const pages = await whileVintedMovesOn(page, () =>
    page.evaluate(
      async ({ id, timeout }) => {
        const out: unknown[] = []
        for (let pageNo = 1; pageNo <= 10; pageNo += 1) {
          const response = await fetch(`/api/v2/wardrobe/${id}/items?page=${pageNo}&per_page=96`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(timeout)
          })
          if (!response.ok) {
            // A 429 here is Vinted's rate limit; the message is what the caller looks for.
            throw new Error(`Vinted answered ${response.status} for the wardrobe.`)
          }
          const body = (await response.json()) as { pagination?: { total_pages?: number } }
          out.push(body)
          if ((body.pagination?.total_pages ?? 1) <= pageNo) {
            break
          }
        }
        return out
      },
      { id: userId, timeout: IN_PAGE_FETCH_TIMEOUT_MS }
    )
  )
  const wardrobe = pages.flatMap(parseWardrobeItems)
  chrome.lastWardrobe = { at: Date.now(), wardrobe }
  chrome.stats.record(wardrobe, new Date())
  return wardrobe
}

/**
 * Vinted's own `Geüpload` wording for each listing.
 *
 * It is only on the listing page, deep in a 2 MB render, so the page is read inside
 * the browser and only the few hundred characters around the detail come back.
 */
async function readUploadedText(page: Page, itemIds: string[]): Promise<Record<string, string | null>> {
  const windows = await page.evaluate(
    async ({ ids, gap, timeout }) => {
      const result: Record<string, string | null> = {}
      for (const [index, id] of ids.entries()) {
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, gap))
        }
        const response = await fetch(`/items/${id}`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(timeout) })
        if (response.status === 429) {
          throw new Error('Vinted answered 429 for a listing page.')
        }
        if (!response.ok) {
          result[id] = null
          continue
        }
        const html = await response.text()
        const at = html.indexOf('upload_date')
        // The flight data escapes its quotes; put them back so the parser sees JSON.
        result[id] = at === -1 ? null : html.slice(Math.max(0, at - 20), at + 300).replace(/\\"/g, '"')
      }
      return result
    },
    { ids: itemIds.slice(0, AGE_READS_PER_REPORT), gap: AGE_READ_GAP_MS, timeout: IN_PAGE_FETCH_TIMEOUT_MS }
  )

  const texts: Record<string, string | null> = {}
  for (const [id, window] of Object.entries(windows)) {
    texts[id] = window ? parseVintedUploadedText(window) : null
  }
  return texts
}

async function readSnapshot(page: Page, itemId: string): Promise<VintedSnapshot> {
  const html = await whileVintedMovesOn(page, () =>
    page.evaluate(
      async ({ id, timeout }) => {
        const response = await fetch(`/items/${id}/edit`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(timeout) })
        if (!response.ok) {
          throw new Error(`Vinted answered ${response.status} for the listing's edit page.`)
        }
        return await response.text()
      },
      { id: itemId, timeout: IN_PAGE_FETCH_TIMEOUT_MS }
    )
  )
  const snapshot = parseVintedSnapshot(html)
  if (!snapshot) {
    throw new VintedRelistError('Could not read the listing off its edit page. Vinted may have changed the page.')
  }
  return snapshot
}

/**
 * The bytes of a product's original photos, ad first, in upload order.
 *
 * The ad is a file in the repo. A slab photo is a media library key, and its file is
 * wherever the library keeps originals: under `seed/media` for a card that came with
 * the seed, in the local bucket or the sync's cache of uploads for one whose photos
 * went in through the admin. The relist used to look in the seed directory alone,
 * so a card whose photos went in through the admin could not be relisted at all.
 */
export async function readOriginalPhotos(root: string, originals: OriginalPhotos, readMedia: MediaSourceReader): Promise<Buffer[]> {
  const photos: Buffer[] = []
  if (originals.ad) {
    const ad = await fs.promises.readFile(path.join(root, originals.ad)).catch(() => null)
    if (!ad) {
      throw new VintedRelistError(`The ad photo ${originals.ad} is missing, so the listing was left alone.`)
    }
    photos.push(ad)
  }
  for (const key of originals.media) {
    const bytes = await readMedia(key)
    if (!bytes) {
      throw new VintedRelistError(`The photo ${key} is not in seed/media or the media library, so the listing was left alone.`)
    }
    photos.push(bytes)
  }
  return photos
}

/**
 * The photos for the new listing, as JPEGs on disk in upload order.
 *
 * A listing that belongs to a product is rebuilt from the product's own originals
 * — the branded ad photo and the slab's front and back — rather than from the old
 * listing's photos: Vinted re-encodes every upload, and after a few relists a copy
 * of the copy looked bad. Only a listing the shop does not know gets its old photos
 * copied over. Either way the files land in the cache, which is what a retry needs
 * after the original listing is gone.
 */
async function preparePhotos(
  page: Page,
  root: string,
  snapshot: VintedSnapshot,
  product: InventoryProduct | null,
  readMedia: MediaSourceReader
): Promise<string[]> {
  const originals = product ? originalPhotos(product) : null
  if (product && !originals) {
    throw new VintedRelistError(`${product.title} has no photos on the site to relist with, so the listing was left alone.`)
  }
  if (!product && snapshot.photos.length === 0) {
    throw new VintedRelistError('The listing has no photos to copy, so it was left alone.')
  }

  // Everything is read before anything is written, so a photo that cannot be found
  // leaves no half-made cache behind.
  const sources: Buffer[] = originals ? await readOriginalPhotos(root, originals, readMedia) : []
  if (!originals) {
    for (const [index, photo] of snapshot.photos.entries()) {
      const response = await page.context().request.get(photo.url, { timeout: 30_000 })
      if (!response.ok()) {
        throw new VintedRelistError(`Could not download photo ${index + 1} of the listing (${response.status()}).`)
      }
      sources.push(Buffer.from(await response.body()))
    }
  }

  const dir = path.join(root, PHOTO_DIR, snapshot.itemId)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  const files: string[] = []
  for (const [index, bytes] of sources.entries()) {
    // The upload form takes JPEG for certain, and `rotate()` bakes in the EXIF orientation.
    const file = path.join(dir, `${String(index + 1).padStart(2, '0')}.jpg`)
    fs.writeFileSync(file, await sharp(bytes).rotate().jpeg({ quality: 92 }).toBuffer())
    files.push(file)
  }
  return files
}

/** Is the listing still in the wardrobe, and open? */
async function stillListed(page: Page, chrome: VintedChrome, session: VintedSession, itemId: string): Promise<boolean> {
  const items = await readWardrobe(page, chrome, session)
  return items.some((item) => String(item.id) === itemId && !item.is_closed)
}

/**
 * Delete the listing through its own page.
 *
 * The confirmation is Vinted's in-page dialog, not a browser `confirm`. What it
 * contains is found by wording rather than by id, and if nothing in it reads like
 * a delete button the dialog's buttons are reported back so the wording can be
 * added — without anything having been deleted.
 */
async function deleteListing(page: Page, chrome: VintedChrome, session: VintedSession, itemId: string): Promise<void> {
  // A fresh tab landed on the listing's page to begin with; that load is not repeated.
  if (vintedItemId(page.url()) !== itemId) {
    await gotoVinted(chrome, page, vintedItemUrl(itemId))
  }
  await waitForBotChallengeClear(page, 'Vinted listing')

  // The seller's buttons only appear once the page has hydrated, a moment after load.
  const remove = page.getByRole('button', { name: /^verwijderen$/i }).first()
  try {
    await remove.waitFor({ state: 'visible', timeout: 15_000 })
  } catch {
    throw new VintedRelistError('No "Verwijderen" button on the listing page. Is this listing yours and still live?')
  }

  // The page keeps a hidden cookie-consent dialog around too — on show for a moment
  // on a window that has not answered the cookie banner yet — so the confirmation is
  // the dialog that is actually visible and not OneTrust's. And the button is drawn
  // before its click handler is wired up, so a click that opens nothing is simply
  // repeated.
  const dialog = page
    .locator('[role="dialog"]:visible')
    .filter({ hasNot: page.locator('[id^="onetrust"]') })
    .first()
  let opened = false
  for (let attempt = 0; attempt < 5 && !opened; attempt += 1) {
    await remove.click()
    opened = await dialog
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
  }
  if (!opened) {
    throw new VintedRelistError('Vinted did not open a confirmation after "Verwijderen".')
  }

  // Some versions of the dialog ask why first; the first reason is as good as any.
  const reason = dialog.locator('[role="radio"], input[type="radio"]').first()
  if ((await reason.count()) > 0) {
    await reason.click().catch(() => undefined)
  }

  const buttons = dialog.getByRole('button')
  const labels = await buttons.allTextContents()
  const index = labels.findIndex((label) => /verwijder|delete/i.test(label) && !/annuleer|cancel|terug/i.test(label))
  if (index === -1) {
    await page.keyboard.press('Escape').catch(() => undefined)
    throw new VintedRelistError(
      `Could not find the confirm button in Vinted's delete dialog (it offers: ${
        labels
          .map((label) => label.trim())
          .filter(Boolean)
          .join(', ') || 'nothing'
      }). Nothing was deleted.`
    )
  }
  await buttons.nth(index).click()

  // Vinted closes the dialog once the delete has gone through, so that is waited
  // for first; the wardrobe is then asked once (twice at most) rather than polled.
  await dialog.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
  for (const wait of [2_000, 6_000]) {
    await sleep(wait)
    if (!(await stillListed(page, chrome, session, itemId))) {
      return
    }
  }
  throw new VintedRelistError('Vinted still lists the item after confirming the delete. Check the Chrome window.')
}

async function catalogTree(page: Page): Promise<VintedCatalogNode[]> {
  return await whileVintedMovesOn(page, () =>
    page.evaluate(async () => {
      const response = await fetch('/api/v2/item_upload/catalogs', { headers: { accept: 'application/json' } })
      if (!response.ok) {
        throw new Error(`Vinted answered ${response.status} for the category tree.`)
      }
      const body = (await response.json()) as { catalogs?: VintedCatalogNode[] }
      return body.catalogs ?? []
    })
  )
}

/** A picker level gets this long to show the cell that is clicked next. */
const CATEGORY_LEVEL_TIMEOUT_MS = 5_000
/** How many times the picker is walked from the top before that counts as a change to Vinted. */
const CATEGORY_WALK_ATTEMPTS = 3

/**
 * Walk the category picker down to the leaf.
 *
 * Every cell in the picker carries its catalog id (`#catalog-<id>`), at every level,
 * so the walk clicks by id and waits for each level to show up rather than guessing
 * how long the slide-in takes.
 *
 * The ground moves under the walk: once the photos are up, Vinted asks its photo
 * recognition for a category and, when the answer comes, prefills the field with
 * it — and puts the picker back at its root level, open or not. That answer lands
 * whenever it lands, at times with the walk on the second level, and the leaf's cell
 * is then nowhere: the walk used to give up after ten seconds with the field, by
 * then, reading exactly the category it was looking for. A level that does not
 * show up is therefore checked against that: a picker back at its root, or shut,
 * is simply walked again from the top. The walk always ends in its own click on
 * the leaf, prefilled or not — that click is what tells the form the seller chose,
 * which stops any later prefill from moving the category again.
 *
 * Exported for the test, which walks a stand-in for Vinted's picker.
 */
export async function pickCategory(page: Page, catalogId: number): Promise<void> {
  const route = catalogPathTo(await catalogTree(page), catalogId)
  if (!route) {
    throw new VintedRelistError(`Vinted's category tree has no category ${catalogId} any more.`)
  }
  const [root] = route
  const leaf = route[route.length - 1]
  const content = page.locator('[data-testid="catalog-select-dropdown-content"]')

  for (let attempt = 1; ; attempt += 1) {
    await openPicker(page, 'catalog-select-dropdown', 'category')
    const missing = await walkCategoryPicker(content, route)
    if (!missing) {
      break
    }
    // Open at some other level than the root, with the cell missing there: Vinted
    // changed the picker, and walking again would not help.
    const open = await content.isVisible()
    const atRoot = open && (await content.locator(`#catalog-${root.id}`).isVisible())
    if (open && !atRoot) {
      throw new VintedRelistError(`Vinted's category picker does not show "${missing.title}" where it used to.`)
    }
    const moved = open ? 'put back at its root' : 'closed'
    if (attempt >= CATEGORY_WALK_ATTEMPTS) {
      throw new VintedRelistError(`Vinted's category picker was ${moved} ${attempt} times while "${missing.title}" was being looked for.`)
    }
    console.info(`[vinted-relist] the category picker was ${moved} mid-walk, walking it again`)
  }

  await content.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined)
  const reads = await fieldReads(page, 'catalog-select-dropdown', leaf.title)
  if (reads !== leaf.title) {
    throw new VintedRelistError(`Vinted's category field reads "${reads}" after picking "${leaf.title}".`)
  }
}

/** How long a picker gets to stop loading and open. */
const PICKER_OPEN_TIMEOUT_MS = 20_000
/** How long the brand picker gets to list the category's own brands before the brand is searched for. */
const BRAND_LISTED_TIMEOUT_MS = 4_000

/**
 * Open one of the form's pickers — a dropdown under a read-only field — and hand
 * back its content, which is only in the DOM while it is open.
 *
 * A click on the field does nothing while Vinted shows a spinner in it, and it does
 * so whenever what the field lists is on its way: the category picker until
 * Vinted's own copy of the tree is in, the brand picker while the brands of the
 * category just chosen are fetched — which Vinted starts half a second after the
 * choice — and the condition picker while the category's attributes are. Each of
 * those used to swallow the one click the relist gave it, after which the option
 * was looked for in a picker that never opened. So the click waits for the spinner
 * to go, and is given again when the picker still did not open: the spinner can
 * come on between the look and the click.
 */
async function openPicker(page: Page, testId: string, what: string): Promise<Locator> {
  const content = page.locator(`[data-testid="${testId}-content"]`)
  const loader = page.locator(`[data-testid="${testId}--loader"]`)
  const input = page.locator(`[data-testid="${testId}-input"]`)
  const deadline = Date.now() + PICKER_OPEN_TIMEOUT_MS
  try {
    await input.waitFor({ state: 'visible', timeout: PICKER_OPEN_TIMEOUT_MS })
  } catch {
    throw new VintedRelistError(`Vinted's ${what} field is not on the form.`)
  }
  for (;;) {
    if (await content.isVisible()) {
      return content
    }
    await loader.waitFor({ state: 'hidden', timeout: Math.max(1, deadline - Date.now()) }).catch(() => undefined)
    await input.click({ timeout: 10_000 })
    const opened = await content
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false)
    if (opened) {
      return content
    }
    if (Date.now() >= deadline) {
      throw new VintedRelistError(`Vinted's ${what} picker does not open. It is still showing its spinner, or has changed.`)
    }
  }
}

/**
 * Click the route's cells one level at a time. Null once the leaf was clicked;
 * otherwise the node whose cell did not turn up — with the picker left as found.
 */
async function walkCategoryPicker(content: Locator, route: VintedCatalogNode[]): Promise<VintedCatalogNode | null> {
  for (const node of route) {
    const cell = content.locator(`#catalog-${node.id}`)
    try {
      await cell.waitFor({ state: 'visible', timeout: CATEGORY_LEVEL_TIMEOUT_MS })
      await cell.click({ timeout: CATEGORY_LEVEL_TIMEOUT_MS })
    } catch {
      return node
    }
  }
  return null
}

/**
 * What a picker's field says, once it says `wanted` — or whatever it says instead
 * after a few seconds. The field follows the form's value a render behind the click.
 */
async function fieldReads(page: Page, testId: string, wanted: string): Promise<string> {
  const input = page.locator(`[data-testid="${testId}-input"]`)
  const deadline = Date.now() + 5_000
  let reads = ''
  for (;;) {
    reads = await input.inputValue().catch(() => '')
    if (reads === wanted || Date.now() >= deadline) {
      return reads
    }
    await sleep(100)
  }
}

/**
 * Pick the listing's brand. Exported for the test.
 *
 * The picker lists the popular brands of the category first, and those follow a
 * category change a moment behind it — so the brand is given a little while to be
 * listed before it is searched for, which is a request to Vinted.
 */
export async function pickBrand(page: Page, snapshot: VintedSnapshot): Promise<void> {
  if (snapshot.brandId == null) {
    return
  }
  const content = await openPicker(page, 'brand-select-dropdown', 'brand')
  const option = content.locator(`#brand-${snapshot.brandId}`)
  const listed = await option
    .waitFor({ state: 'visible', timeout: BRAND_LISTED_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false)
  if (!listed && snapshot.brandTitle) {
    await content.locator('[data-testid="brand-search--input"]').fill(snapshot.brandTitle)
  }
  try {
    await option.waitFor({ state: 'visible', timeout: 10_000 })
  } catch {
    throw new VintedRelistError(`Vinted's brand picker no longer offers ${snapshot.brandTitle ?? snapshot.brandId}.`)
  }
  await option.click()
  await content.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined)
  if (snapshot.brandTitle) {
    const reads = await fieldReads(page, 'brand-select-dropdown', snapshot.brandTitle)
    if (reads !== snapshot.brandTitle) {
      throw new VintedRelistError(`Vinted's brand field reads "${reads}" after picking "${snapshot.brandTitle}".`)
    }
  }
}

/**
 * Pick the listing's condition. Exported for the test.
 *
 * The field is one of the category's attributes, so it is not on the form until
 * Vinted has fetched those for the category just chosen.
 */
export async function pickCondition(page: Page, conditionId: number): Promise<void> {
  const content = await openPicker(page, 'category-condition-single-list', 'condition')
  const option = content.locator(`#condition-${conditionId}`)
  try {
    await option.waitFor({ state: 'visible', timeout: 10_000 })
  } catch {
    throw new VintedRelistError(`Vinted's condition picker no longer offers condition ${conditionId}.`)
  }
  await option.click()
  await content.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined)
}

/** Visible field errors on the upload form, for when the publish does not go through. */
async function formErrors(page: Page): Promise<string[]> {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid$="--error"], [class*="InputField__error"], [class*="Validation"]'))
      .map((element) => element.textContent?.trim() ?? '')
      .filter((text) => text.length > 0)
  )
}

/** The upload form's own path. Vinted leaves it the moment the listing is up. */
const UPLOAD_FORM_PATH = '/items/new'

function onUploadForm(url: URL): boolean {
  return url.pathname.replace(/\/+$/, '') === UPLOAD_FORM_PATH
}

/**
 * The id of the listing Vinted made of the form, once it has made it.
 *
 * Vinted leaves the form the moment the listing is up — these days for the seller's
 * wardrobe, with a promo in front of it; it used to be the listing's own page. So
 * the form going away is the signal, and it comes within seconds of the click; it
 * used to be waited out as a failed publish because only the listing page was looked
 * for. Where Vinted lands decides how the new id is learnt: the listing page says
 * it, from anywhere else the wardrobe is asked which listing took the old one's
 * place — once, and once more after a moment, not polled.
 *
 * A form still up after the full wait has gone through before now, behind a dialog,
 * so the wardrobe gets the same question before the form's errors call it failed. A
 * listing Vinted took that its wardrobe does not show yet stops the relist; the retry
 * asks the wardrobe for it again before it uploads anything (`earlierCopy`).
 */
async function publishedListing(page: Page, chrome: VintedChrome, session: VintedSession, snapshot: VintedSnapshot): Promise<string> {
  const left = await page
    .waitForURL((url) => !onUploadForm(url), { timeout: PUBLISH_TIMEOUT_MS, waitUntil: 'commit' })
    .then(() => true)
    .catch(() => false)

  const inUrl = vintedItemId(page.url())
  if (inUrl) {
    return inUrl
  }
  if (left) {
    // The wardrobe is asked from inside the page, which needs a document to ask from.
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  }

  for (const wait of [0, 3_000]) {
    await sleep(wait)
    const wardrobe = await readWardrobe(page, chrome, session).catch((error: unknown) => {
      if (isRateLimited(error)) {
        throw error
      }
      return null
    })
    const listing = wardrobe ? replacementListing(wardrobe, snapshot.itemId, snapshot.title) : null
    if (listing) {
      return String(listing.id)
    }
  }

  if (left) {
    throw new VintedRelistError(
      'Vinted took the listing, but its wardrobe does not show it yet. Give it a minute and retry: the retry looks for it before it uploads anything.'
    )
  }
  const errors = await formErrors(page)
  throw new VintedRelistError(
    errors.length > 0
      ? `Vinted did not accept the listing: ${errors.join(' · ')}`
      : 'Vinted did not publish the listing. It is still open in the Chrome window.'
  )
}

/** Vinted's "Sorry, er is iets fout gegaan" over the upload form: the form is dead until the page is loaded again. */
const FORM_CRASH_DIALOG = '[data-testid="item-upload-critical-error-dialog--overlay"]'
/** How many times the upload form is loaded and filled before its crashing stops the relist. */
const UPLOAD_FORM_ATTEMPTS = 2

async function formCrashed(page: Page): Promise<boolean> {
  return await page
    .locator(FORM_CRASH_DIALOG)
    .isVisible()
    .catch(() => false)
}

/**
 * Fill the upload form from the snapshot and publish it.
 *
 * The form is Vinted's own; every field is found by the `data-testid` and element
 * ids it renders, and the pickers are keyed on the same ids the edit page reported,
 * so what is selected is the very thing the old listing had.
 *
 * Now and then the form crashes while it is being filled — one of Vinted's own
 * requests behind it (the category suggestion for the photos, once) goes wrong — and
 * Vinted puts up a dialog over it that asks for the page to be loaded again. Every
 * click after that lands on the dialog. Nothing has been saved at that point, so the
 * form is loaded again, as the dialog asks, and filled from the start. The save
 * button is only clicked on a form that has not crashed, and outside that retry: a
 * click that went through is never followed by a second form.
 */
async function uploadListing(
  page: Page,
  chrome: VintedChrome,
  session: VintedSession,
  snapshot: VintedSnapshot,
  photoFiles: string[]
): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fillUploadForm(page, chrome, snapshot, photoFiles)
      if (!(await formCrashed(page))) {
        break
      }
    } catch (error) {
      if (!(await formCrashed(page))) {
        throw error
      }
    }
    if (attempt >= UPLOAD_FORM_ATTEMPTS) {
      throw new VintedRelistError(
        `Vinted's upload form crashed ("Sorry, er is iets fout gegaan") ${attempt} times in a row, before anything was saved. Retry in a while.`
      )
    }
    console.info(`[vinted-relist] ${snapshot.itemId}: Vinted's upload form crashed, loading it again`)
  }

  await page.locator('[data-testid="upload-form-save-button"]').click()
  return await publishedListing(page, chrome, session, snapshot)
}

async function fillUploadForm(page: Page, chrome: VintedChrome, snapshot: VintedSnapshot, photoFiles: string[]): Promise<void> {
  await gotoVinted(chrome, page, `${VINTED}/items/new`)
  await waitForBotChallengeClear(page, 'Vinted upload form')
  await page.locator('[data-testid="add-photos-input"]').waitFor({ state: 'attached', timeout: 20_000 })

  await page.locator('[data-testid="add-photos-input"]').setInputFiles(photoFiles)
  // Every photo gets a tile once it is up; the last tile means they all are.
  await page
    .locator(`[data-testid="image-wrapper-${photoFiles.length - 1}"]`)
    .waitFor({ state: 'visible', timeout: PHOTO_UPLOAD_TIMEOUT_MS })

  await page.locator('[data-testid="title--input"]').fill(snapshot.title)
  await page.locator('[data-testid="description--input"]').fill(snapshot.description)

  await pickCategory(page, snapshot.catalogId)
  await pickBrand(page, snapshot)
  if (snapshot.conditionId != null) {
    await pickCondition(page, snapshot.conditionId)
  }

  const price = page.locator('[data-testid="price-input--input"]')
  await price.fill(vintedPriceInput(snapshot.price))
  await price.blur()

  if (snapshot.packageSizeId != null) {
    const size = page.locator(`[data-testid="package_type_selector_${snapshot.packageSizeId}--input"]`)
    await size.waitFor({ state: 'attached', timeout: 10_000 })
    // Vinted likes to suggest a bigger parcel on pricier cards; the old size wins.
    await page.locator(`[data-testid="${snapshot.packageSizeId}-package-size--cell"]`).click()
    if (!(await size.isChecked())) {
      await size.check({ force: true })
    }
  }

  // Never buy a boost by accident.
  const bump = page.locator('[data-testid="bump-checkbox--input"]')
  if ((await bump.count()) > 0 && (await bump.isChecked())) {
    await page.locator('[data-testid="bump-checkbox"]').click()
  }
}

function cooldownMessage(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  return `Vinted has rate-limited this computer for asking too much. It is being left alone for another ${minutes} min; try after that.`
}

/**
 * Every piece of Vinted work goes through here: none while Vinted has us on a
 * cool-down, and whatever hits its rate limit starts one — so a retry can never
 * make a block worse. Work that goes well leaves the window open for a while, so the
 * next piece finds Vinted already loaded.
 */
async function guarded<T>(chrome: VintedChrome, store: RelistStateStore, work: () => Promise<T>): Promise<T> {
  const remaining = cooldownRemainingMs(store.get())
  if (remaining > 0) {
    throw new VintedRelistError(cooldownMessage(remaining), 429)
  }
  try {
    const result = await work()
    keepScanBrowserOpen(TAB_GRACE_MS)
    return result
  } catch (error) {
    if (!isRateLimited(error)) {
      throw error
    }
    const state = store.update((state) => {
      state.cooldownUntil = new Date(Date.now() + RATE_LIMIT_COOLDOWN_MS).toISOString()
    })
    chrome.lastWardrobe = null
    console.warn(
      `[vinted-relist] ${error instanceof Error ? error.message : 'Rate limited'}, leaving Vinted alone until ${state.cooldownUntil}`
    )
    throw new VintedRelistError(cooldownMessage(RATE_LIMIT_COOLDOWN_MS), 429)
  }
}

/**
 * The wardrobe, and Vinted's word on how old each listing is.
 *
 * The wardrobe itself is one call — and none at all within a minute of the last
 * read, whichever tab made it. The ages are the expensive part — a whole listing
 * page each — so they are read once per listing and kept in the state file; from
 * then on the screen costs Vinted nothing but the wardrobe call. The tab is only
 * asked for once something has to be asked of Vinted.
 *
 * The wardrobe also shows which pending relists the seller finished by hand; those
 * are settled here, and their saved photos are no longer needed.
 */
async function readReport(
  chrome: VintedChrome,
  tab: () => Promise<Page>,
  root: string,
  store: RelistStateStore,
  products: InventoryProduct[]
): Promise<VintedRelistReport> {
  const memo = chrome.lastWardrobe && Date.now() - chrome.lastWardrobe.at < REPORT_TTL_MS ? chrome.lastWardrobe : null
  const wardrobe = memo?.wardrobe ?? (await readFreshWardrobe(await tab(), chrome))

  const byHand: ReturnType<typeof settlePendingByHand> = []
  const settled = store.update((state) => {
    byHand.push(...settlePendingByHand(state, wardrobe))
    // And the ones done on Vinted itself, which never went through here at all.
    byHand.push(...settleMissingByHand(state, wardrobe, products))
  })
  for (const done of byHand) {
    fs.rmSync(path.join(root, PHOTO_DIR, done.previousItemId), { recursive: true, force: true })
  }

  const unknownAge = listingsWithoutAge(wardrobe, settled)
  const ages: Record<string, { text: string | null; readAt: string }> = {}
  if (unknownAge.length > 0) {
    const page = await tab()
    if (memo) {
      // The reads are `fetch`es from inside the tab, which has to be on Vinted for
      // them — a wardrobe answered from memory did not put it there.
      await ensureSession(page, chrome)
    }
    const readAt = new Date().toISOString()
    for (const [itemId, text] of Object.entries(await readUploadedText(page, unknownAge))) {
      ages[itemId] = { text, readAt }
    }
  }
  const listed = new Set(wardrobe.map((item) => String(item.id)))
  const state = store.update((state) => {
    Object.assign(state.ages, ages)
    for (const itemId of Object.keys(state.ages)) {
      if (!listed.has(itemId)) {
        delete state.ages[itemId]
      }
    }
  })

  return buildRelistReport({ wardrobe, products, state, byHand, relisting: [...chrome.inFlight] })
}

async function readFreshWardrobe(page: Page, chrome: VintedChrome): Promise<VintedWardrobeItem[]> {
  return await readWardrobe(page, chrome, await ensureSession(page, chrome))
}

export function createVintedRelistService({
  root,
  openPage,
  store = fileRelistStateStore(root),
  readMedia = firstMediaSource(seedMediaSource(root), cachedMediaSource(root)),
  stats = fileVintedStatsRecorder(root),
  tabs = RELIST_TABS,
  startGapMs = RELIST_START_GAP_MS,
  tabLingerMs = RELIST_TAB_LINGER_MS
}: {
  root: string
  /** Opens a tab in the shared Chrome window; called only when no idle tab is left. */
  openPage: () => Promise<Page>
  store?: RelistStateStore
  /** Where a product's slab photos are read from, by media key; the seed files and the sync's cache of uploads by default. */
  readMedia?: MediaSourceReader
  /** Where the wardrobe reads go for the view and like stats; `.cache/vinted-stats.json(l)` by default. */
  stats?: VintedStatsRecorder
  /**
   * How many relists run at once, how far apart they start, and how long a done
   * relist's tab waits for the next; the constants above unless a test says otherwise.
   */
  tabs?: number
  startGapMs?: number
  tabLingerMs?: number
}): VintedRelistService {
  const chrome = chromeFor(root, tabs, startGapMs, tabLingerMs, stats)

  const openTab = async () => {
    let page: Page
    try {
      page = await openPage()
    } catch (error) {
      throw new VintedRelistError(error instanceof Error ? error.message : 'Could not start Chrome for Vinted.', 503)
    }
    // A half-filled upload form asks whether to leave when the next step navigates
    // away from it; that is always a yes here. Nothing else on Vinted uses native dialogs.
    page.on('dialog', (dialog) => {
      void (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()).catch(() => undefined)
    })
    await page.addInitScript(answerCookieBannerInPage)
    return page
  }

  return {
    report(products) {
      return chrome.reports.run(openTab, (tab) => guarded(chrome, store, () => readReport(chrome, tab, root, store, products)))
    },

    async relist(itemId, products, options = {}) {
      // The button is on the screen until the relist answers, and the screen may be
      // open twice: the second press must not delete the copy the first is putting up.
      if (chrome.inFlight.has(itemId)) {
        throw new VintedRelistError('This listing is already being relisted.', 409)
      }
      chrome.inFlight.add(itemId)
      try {
        return await chrome.relists.run(openTab, (tab) =>
          guarded(chrome, store, () => relistWithTab(tab, chrome, root, store, readMedia, itemId, products, options))
        )
      } finally {
        chrome.inFlight.delete(itemId)
      }
    }
  }
}

async function relistWithTab(
  tab: () => Promise<Page>,
  chrome: VintedChrome,
  root: string,
  store: RelistStateStore,
  readMedia: MediaSourceReader,
  itemId: string,
  products: InventoryProduct[],
  { price }: VintedRelistOptions
): Promise<{ itemId: string; url: string; productId: number | null }> {
  // Each step is named in the terminal — and in the report a relist that stops leaves
  // behind — so a relist that stops shows where it stopped.
  let current = 'getting started'
  const log = (what: string) => {
    current = what
    console.info(`[vinted-relist] ${itemId}: ${what}`)
  }
  // And each step that is about to ask Vinted for something first looks whether
  // another tab has run into Vinted's rate limit meanwhile: this relist then stops
  // here, where its state is written down, rather than asking again.
  const step = (what: string) => {
    const remaining = cooldownRemainingMs(store.get())
    if (remaining > 0) {
      throw new VintedRelistError(cooldownMessage(remaining), 429)
    }
    log(what)
  }

  let pending = store.get().pending[itemId]
  const resumed = Boolean(pending)
  // An earlier go that got past the delete has had an upload under way.
  const uploadedBefore = Boolean(pending?.deletedAt)

  // A card that has gone does not go back up, whatever a tab opened before the sale
  // still shows — and a sold card's record no longer names its listing, so the check
  // goes through our own relist records too. A relist already under way keeps its
  // retry: its listing is down and the snapshot is all that is left of it.
  if (!pending) {
    const product = listingProductLookup(products, store.get())(itemId)
    if (product?.sold || product?.reserved) {
      throw new VintedRelistError(`${product.title} is ${product.sold ? 'sold' : 'reserved'}. A sold card is not relisted.`, 409)
    }
    // The screen holds these back too, but one opened before the last relist does not know.
    const wait = relistWaitMs(store.get().records[itemId]?.listedAt)
    if (wait > 0) {
      throw new VintedRelistError(`This listing went up less than an hour ago. It can be relisted in ${Math.ceil(wait / 60_000)} min.`, 409)
    }
  }

  // A relist that will fail without asking Vinted anything needs no tab and no turn.
  const known = knownSessionProblem(chrome)
  if (known) {
    throw known
  }
  // The tab first, then the wait for this relist's turn: the gap is between what
  // reaches Vinted, and a tab can take a while to open — a whole Chrome, at times.
  const page = await tab()
  const watched = watchTab(page)
  try {
    await spaceOut(chrome)
    step('checking the Vinted session')
    // A fresh tab lands on the listing's own page, which the delete would load anyway;
    // a retry of an upload has no such page any more, and lands on the homepage.
    const session = await ensureSession(page, chrome, pending?.deletedAt ? undefined : vintedItemUrl(itemId))

    if (!pending) {
      // Our own record of the listing names its card when the product's link fell
      // behind, so the relist can still put the product right afterwards.
      const product = listingProductLookup(products, store.get())(itemId) ?? null
      const productId = product?.id ?? null
      step('reading the listing off its edit page')
      const snapshot = await readSnapshot(page, itemId)
      step('preparing the photos')
      const photoFiles = await preparePhotos(page, root, snapshot, product, readMedia)

      // From here the listing can be rebuilt without Vinted, so it is safe to delete —
      // and it is written down first: once the confirm button is clicked the listing
      // may be gone even when Vinted's answer afterwards is lost, and a relist the
      // state file does not know about could not be retried.
      const prepared = { snapshot, productId, photoFiles, deletedAt: '', error: '' }
      store.update((state) => {
        state.pending[itemId] = prepared
      })
      pending = prepared
    }

    if (!pending.deletedAt) {
      try {
        // A retry after a delete that went wrong asks the wardrobe once whether the
        // listing is still up, rather than trying to delete it twice.
        if (!resumed || (await stillListed(page, chrome, session, itemId))) {
          step('deleting the listing')
          await deleteListing(page, chrome, session, itemId)
        }
      } catch (error) {
        const failed = { ...pending, error: error instanceof Error ? error.message : 'The delete failed.' }
        store.update((state) => {
          state.pending[itemId] = failed
        })
        throw error
      }
      const deleted = { ...pending, deletedAt: new Date().toISOString(), error: '' }
      store.update((state) => {
        state.pending[itemId] = deleted
      })
      pending = deleted
    }

    let newItemId: string
    let listedAt = new Date().toISOString()
    try {
      // An earlier go that stopped after its upload may have got the copy up after all
      // — Vinted took it, but its wardrobe did not show it before that go gave up — and
      // uploading it again would put the card on Vinted twice. So the wardrobe is asked
      // first, once.
      let copy: VintedWardrobeItem | null = null
      if (uploadedBefore) {
        step('looking for a copy an earlier go put up')
        copy = earlierCopy(await readWardrobe(page, chrome, session), itemId, pending.snapshot.title, products, store.get())
      }
      if (copy) {
        newItemId = String(copy.id)
        const uploadedAt = wardrobeUploadedAt(copy, new Date())
        listedAt = uploadedAt != null ? new Date(uploadedAt).toISOString() : listedAt
      } else {
        // The snapshot on disk keeps the old price, so a retry without a price is still an exact copy.
        const snapshot = price == null ? pending.snapshot : { ...pending.snapshot, price }
        step('uploading the new listing')
        newItemId = await uploadListing(page, chrome, session, snapshot, pending.photoFiles)
      }
    } catch (error) {
      const failed = { ...pending, error: error instanceof Error ? error.message : 'The upload failed.' }
      store.update((state) => {
        state.pending[itemId] = failed
      })
      throw error
    }

    log(`published as ${newItemId}`)
    const record = { itemId: newItemId, previousItemId: itemId, productId: pending.productId, listedAt }
    store.update((state) => {
      delete state.pending[itemId]
      delete state.records[itemId]
      state.records[newItemId] = record
    })
    fs.rmSync(path.join(root, PHOTO_DIR, itemId), { recursive: true, force: true })

    return { itemId: newItemId, url: vintedItemUrl(newItemId), productId: pending.productId }
  } catch (error) {
    // Not logged in, refused, or left alone for Vinted's rate limit: nothing went wrong
    // in the tab.
    if (!(error instanceof VintedRelistError && [401, 409, 429].includes(error.status))) {
      const entry = store.get().pending[itemId]
      await reportFailure(page, root, {
        itemId,
        title: entry?.snapshot.title ?? null,
        productId: entry?.productId ?? null,
        step: current,
        deleted: Boolean(entry?.deletedAt),
        error,
        tab: watched.lines
      })
    }
    throw error
  } finally {
    watched.stop()
  }
}

/**
 * Keep track of what happens in a relist's tab: every page it goes to, every answer
 * of 400 and up from Vinted, and every request to Vinted that got no answer at all —
 * the last 40 of them, each with the time, for the report a relist that stops leaves.
 */
function watchTab(page: Page): { lines: string[]; stop: () => void } {
  const lines: string[] = []
  const note = (line: string) => {
    lines.push(`${new Date().toISOString().slice(11, 23)} ${line}`)
    if (lines.length > 40) {
      lines.shift()
    }
  }
  const onNavigated = (frame: Frame) => {
    if (frame === page.mainFrame()) {
      note(`on ${frame.url()}`)
    }
  }
  const onResponse = (response: PageResponse) => {
    const url = new URL(response.url())
    if (response.status() >= 400 && isVintedHost(url.hostname)) {
      note(`${response.request().method()} ${url.pathname} answered ${response.status()}`)
    }
  }
  const onFailed = (request: PageRequest) => {
    const url = new URL(request.url())
    if (isVintedHost(url.hostname)) {
      note(`${request.method()} ${url.pathname} got no answer (${request.failure()?.errorText ?? 'unknown'})`)
    }
  }
  page.on('framenavigated', onNavigated)
  page.on('response', onResponse)
  page.on('requestfailed', onFailed)
  return {
    lines,
    stop() {
      page.off('framenavigated', onNavigated)
      page.off('response', onResponse)
      page.off('requestfailed', onFailed)
    }
  }
}

/**
 * Leave what the tab of a relist that stopped shows in `FAILURE_DIR`: a picture of it,
 * and what was read off it — the step it stopped at and Vinted's or Playwright's own
 * words for why, whether the listing was already deleted, the pages the tab went to and
 * Vinted's errors along the way. The error on the screen is gone once the listing is
 * queued again, and the terminal keeps nothing; this does. It is the tab as it stands,
 * so Vinted is asked nothing for it, and once there are more than `FAILURES_KEPT` the
 * oldest go.
 */
async function reportFailure(
  page: Page,
  root: string,
  failure: { itemId: string; title: string | null; productId: number | null; step: string; deleted: boolean; error: unknown; tab: string[] }
): Promise<void> {
  const dir = path.join(root, FAILURE_DIR)
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${failure.itemId}`)
  try {
    const shown = await page
      .evaluate(() => ({
        title: document.title,
        dialogs: Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
          .filter((dialog) => dialog.getClientRects().length > 0)
          .map((dialog) => dialog.innerText.trim().slice(0, 300)),
        text: document.body?.innerText.slice(0, 1_500) ?? ''
      }))
      .catch(() => null)
    const errors = await formErrors(page).catch(() => [])
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      `${file}.json`,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          itemId: failure.itemId,
          title: failure.title,
          productId: failure.productId,
          step: failure.step,
          deleted: failure.deleted,
          error: failure.error instanceof Error ? failure.error.message : String(failure.error),
          url: page.url(),
          tab: failure.tab,
          page: shown && { ...shown, formErrors: errors }
        },
        null,
        2
      )
    )
    await page.screenshot({ path: `${file}.png`, timeout: 5_000 }).catch(() => undefined)
    const reports = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
    for (const name of reports.slice(0, -FAILURES_KEPT)) {
      fs.rmSync(path.join(dir, name), { force: true })
      fs.rmSync(path.join(dir, name.replace(/\.json$/, '.png')), { force: true })
    }
    console.info(`[vinted-relist] ${failure.itemId}: what the tab showed when the relist stopped is in ${path.relative(root, file)}.json`)
  } catch {
    // A report that cannot be written is no reason to stop over.
  }
}
