import fs from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import sharp from 'sharp'
import type { InventoryProduct } from '../app/database/products'
import {
  buildRelistReport,
  catalogPathTo,
  cooldownRemainingMs,
  emptyRelistState,
  listingsWithoutAge,
  normalizeRelistState,
  pageLooksRateLimited,
  parseVintedSnapshot,
  parseVintedUploadedText,
  parseWardrobeItems,
  RATE_LIMIT_COOLDOWN_MS,
  settlePendingByHand,
  vintedItemUrl,
  vintedPriceInput,
  VintedRelistError,
  type VintedCatalogNode,
  type VintedRelistOptions,
  type VintedRelistReport,
  type VintedRelistService,
  type VintedRelistState,
  type VintedSnapshot,
  type VintedWardrobeItem
} from '../app/services/vinted-relist'
import { keepScanBrowserOpen, waitForBotChallengeClear } from './cardmarket-browser'

const STATE_FILE = path.join('.cache', 'vinted-relist.json')
const PHOTO_DIR = path.join('.cache', 'vinted-relist')
const VINTED = 'https://www.vinted.nl'
const LOAD_TIMEOUT_MS = 30_000
/** How long the window stays open for someone to log in to Vinted. */
const LOGIN_GRACE_MS = 10 * 60_000
/** Photos upload one by one; a listing of three can take a while on a slow line. */
const PHOTO_UPLOAD_TIMEOUT_MS = 90_000
const PUBLISH_TIMEOUT_MS = 90_000
/**
 * How long the Chrome window stays open after a piece of Vinted work, so the next
 * one finds the tab already on Vinted. Every fresh window starts by loading Vinted's
 * homepage, and that page alone asks Vinted's API a dozen things.
 */
const TAB_GRACE_MS = 3 * 60_000
/** A wardrobe read within this long of the last one is answered from memory. */
const REPORT_TTL_MS = 60_000
/** Listing pages are read one at a time, this far apart — as a person would browse. */
const AGE_READ_GAP_MS = 1_000
/** And no more than this many per look at the screen; the rest wait for the next. */
const AGE_READS_PER_REPORT = 24

export type RelistStateStore = {
  get(): VintedRelistState
  put(state: VintedRelistState): void
}

export function fileRelistStateStore(root: string): RelistStateStore {
  const filePath = path.join(root, STATE_FILE)
  return {
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
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  return error instanceof VintedRateLimited || (error instanceof Error && RATE_LIMITED_TEXT.test(error.message))
}

/** Throw if the tab is showing Vinted's rate-limit page. */
async function failIfRateLimited(page: Page, where: string): Promise<void> {
  const title = await page.title().catch(() => '')
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 2_000) ?? '').catch(() => '')
  if (pageLooksRateLimited(title, text)) {
    throw new VintedRateLimited(where)
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
 * spins for good, on every URL. That state is only cookies, so once the page has
 * stayed there past any honest refresh, the Vinted cookies are dropped and the visit
 * is made again from clean — which does log the seller out, but the session was not
 * working anyway.
 */
async function gotoVinted(page: Page, url: string, { healSession = true } = {}): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS })
  await failIfRateLimited(page, url)
  if (!SESSION_REFRESH.test(page.url())) {
    return
  }
  const moved = await page
    .waitForURL((current) => !SESSION_REFRESH.test(current.pathname), { timeout: SESSION_REFRESH_WAIT_MS })
    .then(() => true)
    .catch(() => false)
  if (moved) {
    return
  }
  if (!healSession) {
    throw new VintedRelistError('Vinted keeps the Chrome window on its session-refresh page. Close the window and try again.', 503)
  }
  console.info('[vinted-relist] Stuck on Vinted session refresh — clearing Vinted cookies and trying again')
  await page.context().clearCookies({ domain: /vinted\.nl$/ })
  await gotoVinted(page, url, { healSession: false })
}

/**
 * Land on Vinted in the tab and make sure it is the seller's session.
 *
 * Every read after this is a `fetch` from inside the page, which rides on the
 * session's cookies — so nothing works until the page is actually on vinted.nl and
 * logged in. A logged-out window is left open so it can be logged in to.
 */
async function ensureSession(page: Page): Promise<{ userId: number; login: string }> {
  if (!/^https:\/\/www\.vinted\.nl\//.test(page.url()) || SESSION_REFRESH.test(page.url())) {
    await gotoVinted(page, `${VINTED}/`)
  }
  // The tab may have been left on the rate-limit page by the last piece of work.
  await failIfRateLimited(page, page.url())
  const cleared = await waitForBotChallengeClear(page, 'Vinted')
  if (!cleared) {
    keepScanBrowserOpen(LOGIN_GRACE_MS)
    throw new VintedRelistError('Vinted is showing a bot check — clear it in the Chrome window, then try again.', 503)
  }

  const current = await page
    .evaluate(async () => {
      const response = await fetch('/api/v2/users/current', { headers: { accept: 'application/json' } })
      if (response.status === 429) {
        throw new Error('Vinted answered 429 for the current user.')
      }
      if (!response.ok) {
        return null
      }
      const body = (await response.json()) as { user?: { id?: number; login?: string } }
      return body.user?.id && body.user.login ? { userId: body.user.id, login: body.user.login } : null
    })
    .catch((error: unknown) => {
      if (isRateLimited(error)) {
        throw error
      }
      return null
    })

  if (!current) {
    keepScanBrowserOpen(LOGIN_GRACE_MS)
    // Only if the tab is not already showing it: a refresh while logged out must not
    // start the sign-in over.
    if (!/\/member\/(?:signup|register|login)\//.test(page.url())) {
      await gotoVinted(page, `${VINTED}/member/login/email?ref_url=%2F`).catch(() => undefined)
    }
    await page.bringToFront().catch(() => undefined)
    throw new VintedRelistError('Vinted is not logged in. Log in as the shop in the Chrome window, then refresh here.', 401)
  }
  return current
}

async function readWardrobe(page: Page, userId: number): Promise<VintedWardrobeItem[]> {
  const pages = await page.evaluate(async (id) => {
    const out: unknown[] = []
    for (let pageNo = 1; pageNo <= 10; pageNo += 1) {
      const response = await fetch(`/api/v2/wardrobe/${id}/items?page=${pageNo}&per_page=96`, { headers: { accept: 'application/json' } })
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
  }, userId)
  return pages.flatMap(parseWardrobeItems)
}

/**
 * Vinted's own `Geüpload` wording for each listing.
 *
 * It is only on the listing page, deep in a 2 MB render, so the page is read inside
 * the browser and only the few hundred characters around the detail come back.
 */
async function readUploadedText(page: Page, itemIds: string[]): Promise<Record<string, string | null>> {
  const windows = await page.evaluate(
    async ({ ids, gap }) => {
      const result: Record<string, string | null> = {}
      for (const [index, id] of ids.entries()) {
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, gap))
        }
        const response = await fetch(`/items/${id}`, { headers: { accept: 'text/html' } })
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
    { ids: itemIds.slice(0, AGE_READS_PER_REPORT), gap: AGE_READ_GAP_MS }
  )

  const texts: Record<string, string | null> = {}
  for (const [id, window] of Object.entries(windows)) {
    texts[id] = window ? parseVintedUploadedText(window) : null
  }
  return texts
}

async function readSnapshot(page: Page, itemId: string): Promise<VintedSnapshot> {
  const html = await page.evaluate(async (id) => {
    const response = await fetch(`/items/${id}/edit`, { headers: { accept: 'text/html' } })
    if (!response.ok) {
      throw new Error(`Vinted answered ${response.status} for the listing's edit page.`)
    }
    return await response.text()
  }, itemId)
  const snapshot = parseVintedSnapshot(html)
  if (!snapshot) {
    throw new VintedRelistError('Could not read the listing off its edit page — Vinted may have changed the page.')
  }
  if (snapshot.photos.length === 0) {
    throw new VintedRelistError('The listing has no photos to copy, so it was left alone.')
  }
  return snapshot
}

/**
 * Save the listing's photos as JPEGs on disk, in listing order.
 *
 * Vinted serves them as WebP; the upload form takes JPEG for certain, and a file on
 * disk is what a retry needs after the original listing is gone.
 */
async function downloadPhotos(page: Page, root: string, snapshot: VintedSnapshot): Promise<string[]> {
  const dir = path.join(root, PHOTO_DIR, snapshot.itemId)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  const files: string[] = []
  for (const [index, photo] of snapshot.photos.entries()) {
    const response = await page.context().request.get(photo.url, { timeout: 30_000 })
    if (!response.ok()) {
      throw new VintedRelistError(`Could not download photo ${index + 1} of the listing (${response.status()}).`)
    }
    const bytes = Buffer.from(await response.body())
    const file = path.join(dir, `${String(index + 1).padStart(2, '0')}.jpg`)
    fs.writeFileSync(file, await sharp(bytes).rotate().jpeg({ quality: 92 }).toBuffer())
    files.push(file)
  }
  return files
}

/** Is the listing still in the wardrobe, and open? */
async function stillListed(page: Page, userId: number, itemId: string): Promise<boolean> {
  const items = await readWardrobe(page, userId)
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
async function deleteListing(page: Page, userId: number, itemId: string): Promise<void> {
  await gotoVinted(page, vintedItemUrl(itemId))
  await waitForBotChallengeClear(page, 'Vinted listing')

  // The seller's buttons only appear once the page has hydrated, a moment after load.
  const remove = page.getByRole('button', { name: /^verwijderen$/i }).first()
  try {
    await remove.waitFor({ state: 'visible', timeout: 15_000 })
  } catch {
    throw new VintedRelistError('No "Verwijderen" button on the listing page — is this listing yours and still live?')
  }

  // The page keeps a hidden cookie-consent dialog around too, so the confirmation
  // is the dialog that is actually visible — not simply the last one. And the button
  // is drawn before its click handler is wired up, so a click that opens nothing is
  // simply repeated.
  const dialog = page.locator('[role="dialog"]:visible').first()
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
    if (!(await stillListed(page, userId, itemId))) {
      return
    }
  }
  throw new VintedRelistError('Vinted still lists the item after confirming the delete. Check the Chrome window.')
}

async function catalogTree(page: Page): Promise<VintedCatalogNode[]> {
  return await page.evaluate(async () => {
    const response = await fetch('/api/v2/item_upload/catalogs', { headers: { accept: 'application/json' } })
    if (!response.ok) {
      throw new Error(`Vinted answered ${response.status} for the category tree.`)
    }
    const body = (await response.json()) as { catalogs?: VintedCatalogNode[] }
    return body.catalogs ?? []
  })
}

/** Walk the category picker down to the leaf. */
async function pickCategory(page: Page, catalogId: number): Promise<void> {
  const route = catalogPathTo(await catalogTree(page), catalogId)
  if (!route) {
    throw new VintedRelistError(`Vinted's category tree has no category ${catalogId} any more.`)
  }

  await page.locator('[data-testid="catalog-select-dropdown-input"]').click()
  const content = page.locator('[data-testid="catalog-select-dropdown-content"]')
  await content.waitFor({ state: 'visible', timeout: 10_000 })

  for (const [depth, node] of route.entries()) {
    const leaf = depth === route.length - 1
    const byId = content.locator(`#catalog-${node.id}`)
    if (leaf && (await byId.count()) > 0) {
      await byId.click()
    } else {
      const exact = content.locator('li').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(node.title)}\\s*$`) })
      const cell = ((await exact.count()) > 0 ? exact : content.locator('li').filter({ hasText: node.title })).first()
      try {
        await cell.waitFor({ state: 'visible', timeout: 10_000 })
      } catch {
        throw new VintedRelistError(`Vinted's category picker does not show "${node.title}" where it used to.`)
      }
      const control = cell.locator('[role="button"], [role="radio"]')
      await ((await control.count()) > 0 ? control.first() : cell).click()
    }
    if (!leaf) {
      // The next level slides in; give it a moment before looking for the next title.
      await sleep(400)
    }
  }

  await page
    .locator('[data-testid="catalog-select-dropdown-content"]')
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => undefined)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function pickById(page: Page, inputTestId: string, elementId: string, what: string): Promise<void> {
  await page.locator(`[data-testid="${inputTestId}"]`).click()
  const option = page.locator(`#${elementId}`)
  try {
    await option.waitFor({ state: 'visible', timeout: 10_000 })
  } catch {
    throw new VintedRelistError(`Vinted's ${what} picker no longer offers ${elementId}.`)
  }
  await option.click()
}

async function pickBrand(page: Page, snapshot: VintedSnapshot): Promise<void> {
  if (snapshot.brandId == null) {
    return
  }
  await page.locator('[data-testid="brand-select-dropdown-input"]').click()
  const option = page.locator(`#brand-${snapshot.brandId}`)
  if ((await option.count()) === 0 && snapshot.brandTitle) {
    // Not among the popular brands for this category: search for it.
    await page.locator('[data-testid="brand-search--input"]').fill(snapshot.brandTitle)
  }
  try {
    await option.waitFor({ state: 'visible', timeout: 10_000 })
  } catch {
    throw new VintedRelistError(`Vinted's brand picker no longer offers ${snapshot.brandTitle ?? snapshot.brandId}.`)
  }
  await option.click()
}

/** Visible field errors on the upload form, for when the publish does not go through. */
async function formErrors(page: Page): Promise<string[]> {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid$="--error"], [class*="InputField__error"], [class*="Validation"]'))
      .map((element) => element.textContent?.trim() ?? '')
      .filter((text) => text.length > 0)
  )
}

/**
 * Fill the upload form from the snapshot and publish it.
 *
 * The form is Vinted's own; every field is found by the `data-testid` and element
 * ids it renders, and the pickers are keyed on the same ids the edit page reported,
 * so what is selected is the very thing the old listing had.
 */
/**
 * The listing that appeared in the wardrobe since `before`, if one did.
 *
 * Vinted sometimes puts a dialog up after publishing instead of moving to the new
 * listing, which looks like a failed publish from outside. Before calling it that,
 * the wardrobe is asked whether the listing is there — a retry on a listing that
 * did go up would put it up twice.
 */
async function freshListing(page: Page, userId: number, before: Set<string>, title: string): Promise<string | null> {
  const items = await readWardrobe(page, userId).catch(() => [])
  return items.find((item) => !before.has(String(item.id)) && item.title === title && !item.is_closed)?.id.toString() ?? null
}

async function uploadListing(page: Page, userId: number, snapshot: VintedSnapshot, photoFiles: string[]): Promise<string> {
  const before = new Set((await readWardrobe(page, userId)).map((item) => String(item.id)))

  await gotoVinted(page, `${VINTED}/items/new`)
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
    await pickById(page, 'category-condition-single-list-input', `condition-${snapshot.conditionId}`, 'condition')
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

  await page.locator('[data-testid="upload-form-save-button"]').click()

  try {
    await page.waitForURL(/\/items\/\d+/, { timeout: PUBLISH_TIMEOUT_MS })
  } catch {
    const published = await freshListing(page, userId, before, snapshot.title)
    if (published) {
      return published
    }
    const errors = await formErrors(page)
    throw new VintedRelistError(
      errors.length > 0
        ? `Vinted did not accept the listing: ${errors.join(' · ')}`
        : 'Vinted did not publish the listing. It is still open in the Chrome window.'
    )
  }

  const itemId = page.url().match(/\/items\/(\d+)/)?.[1]
  if (!itemId) {
    throw new VintedRelistError('The listing was published but its URL could not be read.')
  }
  return itemId
}

/**
 * The one Vinted tab, and the queue of work for it.
 *
 * Every request used to open a tab of its own, and the screen fires two on load —
 * so Vinted saw several tabs renewing the same session at once, and wedged all of
 * them on its session-refresh page. One tab, reused while it is open, with the work
 * lined up behind each other, is what Vinted expects of a person.
 */
let vintedTab: Page | null = null
let queue: Promise<unknown> = Promise.resolve()
/** The last wardrobe read, answered again to anyone who asks within `REPORT_TTL_MS`. */
let lastWardrobe: { at: number; login: string; wardrobe: VintedWardrobeItem[] } | null = null

async function acquireTab(openPage: () => Promise<Page>): Promise<Page> {
  if (vintedTab && !vintedTab.isClosed()) {
    return vintedTab
  }
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
  vintedTab = page
  return page
}

function withTab<T>(openPage: () => Promise<Page>, run: (page: Page) => Promise<T>): Promise<T> {
  const job = queue.then(async () => run(await acquireTab(openPage)))
  queue = job.then(
    () => undefined,
    () => undefined
  )
  return job
}

/** Test seam: forget the tab between tests. */
export function resetVintedTab() {
  vintedTab = null
  queue = Promise.resolve()
  lastWardrobe = null
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
async function guarded<T>(store: RelistStateStore, work: () => Promise<T>): Promise<T> {
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
    const state = store.get()
    state.cooldownUntil = new Date(Date.now() + RATE_LIMIT_COOLDOWN_MS).toISOString()
    store.put(state)
    lastWardrobe = null
    console.warn(
      `[vinted-relist] ${error instanceof Error ? error.message : 'Rate limited'} — leaving Vinted alone until ${state.cooldownUntil}`
    )
    throw new VintedRelistError(cooldownMessage(RATE_LIMIT_COOLDOWN_MS), 429)
  }
}

/**
 * The wardrobe, and Vinted's word on how old each listing is.
 *
 * The wardrobe itself is one call. The ages are the expensive part — a whole listing
 * page each — so they are read once per listing and kept in the state file; from
 * then on the screen costs Vinted nothing but the wardrobe call.
 *
 * The wardrobe also shows which pending relists the seller finished by hand; those
 * are settled here, and their saved photos are no longer needed.
 */
async function readReport(page: Page, root: string, store: RelistStateStore, products: InventoryProduct[]): Promise<VintedRelistReport> {
  const memo = lastWardrobe && Date.now() - lastWardrobe.at < REPORT_TTL_MS ? lastWardrobe : null
  const { login, wardrobe } = memo ?? (await readFreshWardrobe(page))
  const state = store.get()

  const byHand = settlePendingByHand(state, wardrobe)
  for (const done of byHand) {
    fs.rmSync(path.join(root, PHOTO_DIR, done.previousItemId), { recursive: true, force: true })
  }

  const unknownAge = listingsWithoutAge(wardrobe, state)
  if (unknownAge.length > 0) {
    if (memo) {
      // The reads are `fetch`es from inside the tab, which has to be on Vinted for
      // them — a wardrobe answered from memory did not put it there.
      await ensureSession(page)
    }
    const readAt = new Date().toISOString()
    for (const [itemId, text] of Object.entries(await readUploadedText(page, unknownAge))) {
      state.ages[itemId] = { text, readAt }
    }
  }
  const listed = new Set(wardrobe.map((item) => String(item.id)))
  for (const itemId of Object.keys(state.ages)) {
    if (!listed.has(itemId)) {
      delete state.ages[itemId]
    }
  }
  store.put(state)

  return buildRelistReport({ wardrobe, products, state, login, byHand })
}

async function readFreshWardrobe(page: Page): Promise<{ login: string; wardrobe: VintedWardrobeItem[] }> {
  const { userId, login } = await ensureSession(page)
  const wardrobe = await readWardrobe(page, userId)
  lastWardrobe = { at: Date.now(), login, wardrobe }
  return { login, wardrobe }
}

export function createVintedRelistService({
  root,
  openPage,
  store = fileRelistStateStore(root)
}: {
  root: string
  /** Opens a tab in the shared Chrome window; called only when there is none yet. */
  openPage: () => Promise<Page>
  store?: RelistStateStore
}): VintedRelistService {
  return {
    report(products) {
      return guarded(store, () => withTab(openPage, (page) => readReport(page, root, store, products)))
    },

    relist(itemId, products, options = {}) {
      // The wardrobe is about to change; nobody gets the old one after this.
      lastWardrobe = null
      return guarded(store, () => withTab(openPage, (page) => relistWithTab(page, root, store, itemId, products, options)))
    }
  }
}

async function relistWithTab(
  page: Page,
  root: string,
  store: RelistStateStore,
  itemId: string,
  products: InventoryProduct[],
  { price }: VintedRelistOptions
): Promise<{ itemId: string; url: string; productId: number | null }> {
  const { userId } = await ensureSession(page)
  const state = store.get()
  let pending = state.pending[itemId]
  const resumed = Boolean(pending)

  if (!pending) {
    const productId = products.find((product) => product.vintedUrl?.includes(`/items/${itemId}`))?.id ?? null
    const snapshot = await readSnapshot(page, itemId)
    const photoFiles = await downloadPhotos(page, root, snapshot)

    // From here the listing can be rebuilt without Vinted, so it is safe to delete —
    // and it is written down first: once the confirm button is clicked the listing
    // may be gone even when Vinted's answer afterwards is lost, and a relist the
    // state file does not know about could not be retried.
    pending = { snapshot, productId, photoFiles, deletedAt: '', error: '' }
    state.pending[itemId] = pending
    store.put(state)
  }

  if (!pending.deletedAt) {
    try {
      // A retry after a delete that went wrong asks the wardrobe once whether the
      // listing is still up, rather than trying to delete it twice.
      if (!resumed || (await stillListed(page, userId, itemId))) {
        await deleteListing(page, userId, itemId)
      }
      pending.deletedAt = new Date().toISOString()
      pending.error = ''
    } catch (error) {
      pending.error = error instanceof Error ? error.message : 'The delete failed.'
      state.pending[itemId] = pending
      store.put(state)
      throw error
    }
    store.put(state)
  }

  let newItemId: string
  try {
    // The snapshot on disk keeps the old price, so a retry without a price is still an exact copy.
    const snapshot = price == null ? pending.snapshot : { ...pending.snapshot, price }
    newItemId = await uploadListing(page, userId, snapshot, pending.photoFiles)
  } catch (error) {
    pending.error = error instanceof Error ? error.message : 'The upload failed.'
    state.pending[itemId] = pending
    store.put(state)
    throw error
  }

  delete state.pending[itemId]
  delete state.records[itemId]
  state.records[newItemId] = {
    itemId: newItemId,
    previousItemId: itemId,
    productId: pending.productId,
    listedAt: new Date().toISOString()
  }
  store.put(state)
  fs.rmSync(path.join(root, PHOTO_DIR, itemId), { recursive: true, force: true })

  return { itemId: newItemId, url: vintedItemUrl(newItemId), productId: pending.productId }
}
