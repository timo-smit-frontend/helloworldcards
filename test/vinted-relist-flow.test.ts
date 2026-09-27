import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Browser, BrowserContext, Route } from 'playwright'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { InventoryProduct } from '../app/database/products'
import { emptyRelistState, type VintedRelistState } from '../app/services/vinted-relist'
import { createVintedRelistService, relistStateStore, type VintedLogin } from '../vite/vinted-relist'

/**
 * The whole relist — session, snapshot, photos, delete, upload, publish — against a
 * stand-in for Vinted served into headless Chrome, so nothing here ever reaches the
 * real site. The stand-in has what the relist relies on: the wardrobe and current
 * user APIs, an edit page carrying the listing's model the way Next.js writes it, a
 * listing page with the delete button and its confirmation dialog, and the upload
 * form with its pickers, which it takes a listing off and puts in the wardrobe.
 *
 * What is under test is the shape of the whole: several relists at once, each in a
 * tab of its own, without asking Vinted anything twice that one answer covers.
 */
const USER = { id: 42, login: 'helloworldcards' }
/** The shop's login, as `.env` has it. */
const ACCOUNT: VintedLogin = { username: 'shop@example.com', password: 'hunter2-hunter2' }
const TREE = [
  { id: 1904, title: 'Dames' },
  {
    id: 4824,
    title: "Hobby's & verzamelen",
    catalogs: [{ id: 4874, title: 'Ruilkaarten', catalogs: [{ id: 4875, title: 'Losse ruilkaarten' }] }]
  }
]

/** A listing in the wardrobe; one uploaded a moment ago is only in the wardrobe's answers from `shownFrom` on. */
type Listing = { id: number; title: string; description: string; price: number; uploadedAt: number; shownFrom?: number }
type Upload = {
  title: string
  description: string
  catalogId: number
  brandId: number
  conditionId: number
  price: string
  packageSizeId: number
  photos: number
}

type Vinted = {
  wardrobe: Listing[]
  uploads: Upload[]
  loggedIn: boolean
  /** Every request, as `METHOD /path`, with when it came in. */
  requests: Array<{ line: string; at: number }>
  nextId: number
  /**
   * The cookie banner. `script`: OneTrust's script, with its `RejectAll()`, is on the
   * page, as on Vinted. `covered`: something sits over the banner's buttons, so no
   * click from outside the page reaches them.
   */
  banner: { script: boolean; covered: boolean }
  /** The login form ignores Enter; and for this many loads of it, sends nothing at all. */
  loginForm: { swallowEnter: boolean; deadLoads: number }
  /** How many `anon_id`s were handed out: one for every page asked for without one, as Vinted does. */
  anonIds: number
  /** How many pages were asked for with a stale session, and got the session-refresh page that never moves on. */
  stuckRefreshes: number
  /**
   * How slow Vinted is, in ms: how long after a delete the listing's page takes the tab
   * to the seller's own page; that page itself — where the tab goes after a publish
   * too; each answer from the wardrobe; and how long a new upload takes to show up in
   * the wardrobe.
   */
  slow: { leaveDeletedListingMs: number; sellerPageMs: number; wardrobeMs: number; newListingShownAfterMs: number }
}

function vinted(listings: Array<Pick<Listing, 'id' | 'title'>>): Vinted {
  return {
    wardrobe: listings.map((listing) => ({
      ...listing,
      description: `Mooie ${listing.title.split(' ')[0]}.\n\nDetails:\n• Grade: PSA 9`,
      price: 89.99,
      uploadedAt: Date.UTC(2026, 8, 1) / 1000
    })),
    uploads: [],
    loggedIn: true,
    requests: [],
    nextId: 5000,
    banner: { script: true, covered: false },
    loginForm: { swallowEnter: false, deadLoads: 0 },
    anonIds: 0,
    stuckRefreshes: 0,
    slow: { leaveDeletedListingMs: 0, sellerPageMs: 0, wardrobeMs: 0, newListingShownAfterMs: 0 }
  }
}

/** Wrap flight data the way Next.js writes it: JS string literals pushed from scripts. */
function editPage(listing: Listing): string {
  const model = {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    colorIds: [],
    catalogId: 4875,
    packageSizeId: 1,
    brand: { id: 191646, title: 'Pokémon' },
    brandId: 191646,
    price: listing.price,
    isUnisex: false,
    itemAttributes: [{ ids: [3], code: 'condition' }]
  }
  const photos = [{ id: listing.id * 10, url: `https://images1.vinted.net/${listing.id}.webp` }]
  const flight = `a1:["$","$La2",null,{"itemEditModel":${JSON.stringify(model)},"photos":${JSON.stringify(photos)},"children":"$Lc0"}]\n`
  const chunks = flight.match(/[\s\S]{1,120}/gu) ?? []
  return `<!DOCTYPE html><html><body>${chunks.map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`).join('')}</body></html>`
}

/**
 * The listing's page; only its seller, logged in, gets the button that deletes it.
 * Once the listing is deleted, the page takes the tab to the seller's own page, as
 * Vinted does — the tab does not stay on a listing that is gone — `leaveAfterMs`
 * after the delete. (Right away, the click on the confirm button waits for that as its
 * own navigation; a moment later, nothing waits for it.)
 */
function listingPage(listing: Listing, seller: boolean, leaveAfterMs: number): string {
  return `<!DOCTYPE html><html><head><title>${listing.title}</title></head><body>
<h1>${listing.title}</h1>
${seller ? '<button type="button" id="remove">Verwijderen</button>' : ''}
<div role="dialog" id="dialog" hidden>
  <p>Weet je zeker dat je dit item wilt verwijderen?</p>
  <button type="button" id="cancel">Annuleren</button>
  <button type="button" id="confirm">Verwijderen</button>
</div>
<script>
  const dialog = document.getElementById('dialog')
  document.getElementById('remove')?.addEventListener('click', () => { dialog.hidden = false })
  document.getElementById('cancel').addEventListener('click', () => { dialog.hidden = true })
  document.getElementById('confirm').addEventListener('click', async () => {
    await fetch('/api/v2/items/${listing.id}/delete', { method: 'POST' })
    dialog.hidden = true
    setTimeout(() => { location.href = '/member/${USER.id}' }, ${leaveAfterMs})
  })
</script></body></html>`
}

/**
 * Vinted's cookie banner, as OneTrust puts it up on every page of a window that has
 * not answered it: OneTrust's script comes in a second after the page, and the banner
 * a moment later — sliding in, a dialog, over a dark layer that takes every click
 * meant for the page. It stays away once its consent cookie is set, and `RejectAll()`
 * answers it just as the "Alleen essentiële cookies" button does.
 */
function cookieBanner({ script, covered }: Vinted['banner']): string {
  return String.raw`<div id="onetrust-consent-sdk">
  <div class="onetrust-pc-dark-filter" style="display: none; position: fixed; inset: 0; z-index: 10; background: rgba(0, 0, 0, 0.6)"></div>
  <div id="onetrust-banner-sdk" role="dialog" style="display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 11; background: #fff; transform: translateY(100%); transition: transform 0.5s">
    <p>Wij en onze partners gebruiken cookies.</p>
    <button type="button" id="onetrust-accept-btn-handler">Alle toestaan</button>
    <button type="button" id="onetrust-reject-all-handler">Alleen essentiële cookies</button>
    ${covered ? '<div style="position: absolute; inset: 0"></div>' : ''}
  </div>
</div>
<script>
  (() => {
    const layers = [document.querySelector('.onetrust-pc-dark-filter'), document.getElementById('onetrust-banner-sdk')]
    const answered = () => document.cookie.includes('OptanonAlertBoxClosed=')
    const answer = (groups) => {
      document.cookie = 'OptanonAlertBoxClosed=' + new Date().toISOString() + '; path=/'
      document.cookie = 'OptanonConsent=groups:' + groups + '; path=/'
      layers.forEach((layer) => (layer.style.display = 'none'))
    }
    document.getElementById('onetrust-accept-btn-handler').addEventListener('click', () => answer('all'))
    document.getElementById('onetrust-reject-all-handler').addEventListener('click', () => answer('essential'))
    setTimeout(() => {
      if (${script}) {
        window.OneTrust = { RejectAll: () => answer('essential'), AllowAll: () => answer('all'), IsAlertBoxClosed: answered }
      }
      if (answered()) return
      setTimeout(() => {
        layers.forEach((layer) => (layer.style.display = 'block'))
        requestAnimationFrame(() => requestAnimationFrame(() => (layers[1].style.transform = 'none')))
      }, 300)
    }, 1000)
  })()
</script>`
}

/**
 * The email login page, keyed as Vinted keys it. A form that `swallowEnter`s is not
 * sent on Enter; a `dead` one is not sent at all, on Enter or on its button.
 */
function loginPage({ swallowEnter, dead }: { swallowEnter: boolean; dead: boolean }): string {
  return String.raw`<!DOCTYPE html><html><head><title>Vinted</title></head><body>
<form id="login">
  <h2>Inloggen</h2>
  <p id="error" hidden></p>
  <input type="text" id="username" name="username" placeholder="Gebruikersnaam of e-mailadres">
  <input type="password" id="password" name="password" placeholder="Wachtwoord">
  <button type="submit">Verder</button>
  <a href="/member/login/reset_password">Wachtwoord vergeten?</a>
</form>
<script>
  const form = document.getElementById('login')
  if (${swallowEnter}) {
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') event.preventDefault()
    })
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (${dead}) return
    const response = await fetch('/web/api/auth/oauth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: document.getElementById('username').value, password: document.getElementById('password').value })
    })
    if (response.ok) {
      location.href = new URLSearchParams(location.search).get('ref_url') || '/'
      return
    }
    const error = document.getElementById('error')
    error.textContent = 'Onjuiste gebruikersnaam of wachtwoord.'
    error.hidden = false
  })
</script></body></html>`
}

/** The upload form, with the fields and pickers the relist fills, keyed as Vinted keys them. */
const UPLOAD_FORM = String.raw`<!DOCTYPE html><html><head><title>Item uploaden</title></head><body>
<input type="file" multiple data-testid="add-photos-input">
<div id="photos"></div>
<input data-testid="title--input">
<textarea data-testid="description--input"></textarea>
<input data-testid="catalog-select-dropdown-input" readonly>
<div data-testid="catalog-select-dropdown-content" hidden></div>
<input data-testid="brand-select-dropdown-input" readonly>
<div data-testid="brand-select-dropdown-content" hidden>
  <input data-testid="brand-search--input">
  <div id="brand-191646">Pokémon</div>
</div>
<input data-testid="category-condition-single-list-input" readonly>
<div data-testid="category-condition-single-list-content" hidden>
  <div id="condition-3">Heel goed</div>
</div>
<input data-testid="price-input--input">
<div data-testid="1-package-size--cell">Klein</div>
<input type="radio" name="package" data-testid="package_type_selector_1--input">
<button type="button" data-testid="upload-form-save-button">Uploaden</button>
<script>
  const byTestId = (id) => document.querySelector('[data-testid="' + id + '"]')
  const form = { catalogId: null, brandId: null, conditionId: null, packageSizeId: null, photos: 0 }

  byTestId('add-photos-input').addEventListener('change', (event) => {
    form.photos = event.target.files.length
    byTestId('add-photos-input').insertAdjacentHTML('afterend', Array.from(event.target.files, (_, i) => '<div data-testid="image-wrapper-' + i + '">photo</div>').join(''))
  })

  const tree = window.__tree
  const content = byTestId('catalog-select-dropdown-content')
  const showLevel = (nodes) => {
    content.innerHTML = nodes.map((node) => '<div id="catalog-' + node.id + '">' + node.title + '</div>').join('')
    for (const node of nodes) {
      document.getElementById('catalog-' + node.id).addEventListener('click', () => {
        if (node.catalogs) {
          showLevel(node.catalogs)
          return
        }
        form.catalogId = node.id
        byTestId('catalog-select-dropdown-input').value = node.title
        content.hidden = true
      })
    }
  }
  byTestId('catalog-select-dropdown-input').addEventListener('click', () => {
    showLevel(tree)
    content.hidden = false
  })

  const brands = byTestId('brand-select-dropdown-content')
  byTestId('brand-select-dropdown-input').addEventListener('click', () => { brands.hidden = false })
  document.getElementById('brand-191646').addEventListener('click', () => {
    form.brandId = 191646
    byTestId('brand-select-dropdown-input').value = 'Pokémon'
    brands.hidden = true
  })

  const conditions = byTestId('category-condition-single-list-content')
  byTestId('category-condition-single-list-input').addEventListener('click', () => { conditions.hidden = false })
  document.getElementById('condition-3').addEventListener('click', () => {
    form.conditionId = 3
    byTestId('category-condition-single-list-input').value = 'Heel goed'
    conditions.hidden = true
  })

  byTestId('1-package-size--cell').addEventListener('click', () => {
    form.packageSizeId = 1
    byTestId('package_type_selector_1--input').checked = true
  })

  byTestId('upload-form-save-button').addEventListener('click', async () => {
    const body = { ...form, title: byTestId('title--input').value, description: byTestId('description--input').value, price: byTestId('price-input--input').value }
    await fetch('/api/v2/item_upload/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    location.href = '/member/42?promo_shown=true'
  })
</script></body></html>`

const html = (body: string) => ({ contentType: 'text/html; charset=utf-8', body })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Answer the tab's requests the way Vinted would. A page asked for with a stale
 * session is the session-refresh page instead, which never moves on — until the
 * cookie that makes it stale is gone. (It moves to its own URL from inside the page:
 * a redirect would not do, since Playwright hands only the first URL of a redirect to
 * the route, and the page it redirects to would be asked of the real Vinted.)
 */
async function serve(site: Vinted, route: Route, context: BrowserContext): Promise<void> {
  const request = route.request()
  const url = new URL(request.url())
  site.requests.push({ line: `${request.method()} ${url.pathname}`, at: Date.now() })
  // What the request carries is the window's cookie jar: an intercepted request's own
  // headers do not have its cookies in them yet.
  const cookies = new Map((await context.cookies('https://www.vinted.nl')).map((cookie) => [cookie.name, cookie.value]))
  if (request.isNavigationRequest() && cookies.get('refresh_token_web') === 'stale') {
    site.stuckRefreshes += 1
    const refresh = `/session-refresh?ref_url=${encodeURIComponent(url.pathname)}`
    await route.fulfill(
      html(
        `<!DOCTYPE html><html><head><title>Vinted</title><script>history.replaceState(null, '', ${JSON.stringify(refresh)})</script></head><body><p>Sessie vernieuwen</p></body></html>`
      )
    )
    return
  }
  const headers: Record<string, string> = {}
  if (request.isNavigationRequest() && !cookies.has('anon_id')) {
    headers['set-cookie'] = `anon_id=${++site.anonIds}; path=/`
  }
  /** A page as Vinted serves it: with the cookie banner, and an `anon_id` for a window without one. */
  const page = (body: string) => ({ ...html(body.replace('</body>', `${cookieBanner(site.banner)}</body>`)), headers })
  const listingId = /^\/items\/(\d+)/.exec(url.pathname)?.[1]
  const listing = listingId ? site.wardrobe.find((candidate) => String(candidate.id) === listingId) : undefined
  const deleteId = /^\/api\/v2\/items\/(\d+)\/delete$/.exec(url.pathname)?.[1]

  if (url.pathname === '/api/v2/users/current') {
    await (site.loggedIn ? route.fulfill({ json: { user: USER } }) : route.fulfill({ status: 401, json: {} }))
  } else if (url.pathname === `/api/v2/wardrobe/${USER.id}/items`) {
    await sleep(site.slow.wardrobeMs)
    const items = site.wardrobe
      .filter((item) => (item.shownFrom ?? 0) <= Date.now())
      .map((item) => ({
        id: item.id,
        title: item.title,
        price: { amount: item.price.toFixed(2) },
        photos: [{ url: `https://images1.vinted.net/${item.id}.webp`, high_resolution: { timestamp: item.uploadedAt } }]
      }))
    await route.fulfill({ json: { items, pagination: { total_pages: 1 } } })
  } else if (url.pathname === '/api/v2/item_upload/catalogs') {
    await route.fulfill({ json: { catalogs: TREE } })
  } else if (url.pathname === '/api/v2/item_upload/items' && request.method() === 'POST') {
    const upload = request.postDataJSON() as Upload
    site.uploads.push(upload)
    site.wardrobe.push({
      id: site.nextId++,
      title: upload.title,
      description: upload.description,
      price: Number(upload.price.replace(',', '.')),
      uploadedAt: Math.floor(Date.now() / 1000),
      shownFrom: Date.now() + site.slow.newListingShownAfterMs
    })
    await route.fulfill({ json: { id: site.nextId - 1 } })
  } else if (deleteId && request.method() === 'POST') {
    site.wardrobe = site.wardrobe.filter((candidate) => String(candidate.id) !== deleteId)
    await route.fulfill({ json: {} })
  } else if (url.pathname === '/web/api/auth/oauth' && request.method() === 'POST') {
    const { username, password } = request.postDataJSON() as VintedLogin
    site.loggedIn = username === ACCOUNT.username && password === ACCOUNT.password
    await (site.loggedIn ? route.fulfill({ json: {} }) : route.fulfill({ status: 401, json: {} }))
  } else if (url.pathname === '/member/login/email') {
    const dead = site.loginForm.deadLoads > 0
    site.loginForm.deadLoads -= dead ? 1 : 0
    await route.fulfill(page(loginPage({ swallowEnter: site.loginForm.swallowEnter, dead })))
  } else if (url.pathname === '/items/new') {
    await route.fulfill(page(UPLOAD_FORM.replace('window.__tree', JSON.stringify(TREE))))
  } else if (listing && url.pathname.endsWith('/edit')) {
    await route.fulfill(html(editPage(listing)))
  } else if (listing) {
    await route.fulfill(page(listingPage(listing, site.loggedIn, site.slow.leaveDeletedListingMs)))
  } else if (url.pathname === '/' || url.pathname.startsWith('/member/')) {
    if (url.pathname.startsWith('/member/')) {
      await sleep(site.slow.sellerPageMs)
    }
    await route.fulfill(page('<!DOCTYPE html><html><head><title>Vinted</title></head><body><h1>Vinted</h1></body></html>'))
  } else {
    await route.fulfill({ status: 404, ...html('<!DOCTYPE html><html><body>Niet gevonden</body></html>') })
  }
}

let browser: Browser | null = null
const roots: string[] = []
const contexts: BrowserContext[] = []
const spies: Array<ReturnType<typeof vi.spyOn>> = []

beforeAll(async () => {
  // The relist drives the installed Google Chrome, so the test does too; without one there is nothing to test against.
  // Its proxy leads nowhere: whatever the stand-in does not answer fails, rather than
  // reaching the real Vinted — which rate-limits this computer for asking too much.
  browser = await chromium.launch({ channel: 'chrome', headless: true, proxy: { server: 'http://127.0.0.1:9' } }).catch(() => null)
})

afterAll(async () => {
  await browser?.close()
})

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close().catch(() => undefined)))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
  for (const spy of spies.splice(0)) {
    spy.mockRestore()
  }
})

function product(id: number, title: string, cert: number, listingId: number): InventoryProduct {
  return {
    id,
    title,
    subtitle: '',
    description: '',
    slug: `p-${id}`,
    images: [`/media/${cert}_front.jpg`],
    vintedUrl: `https://www.vinted.nl/items/${listingId}`
  }
}

const CARDS = [
  { listingId: 1001, product: product(1, 'Mewtwo Reverse', 148651617, 1001), title: 'Mewtwo Reverse 51/108 – PSA 9 – XY Evolutions' },
  { listingId: 1002, product: product(2, 'Pikachu', 155373625, 1002), title: 'Pikachu 160/159 – PSA 9 – Crown Zenith' },
  { listingId: 1003, product: product(3, 'Psyduck', 161000001, 1003), title: 'Psyduck 54/102 – PSA 10 – Base Set' }
]

/**
 * A project root with an ad photo per card, and the stand-in Vinted served into a
 * window of its own — with `cookies` in it already, for www.vinted.nl.
 */
async function setUp(
  options: {
    tabs: number
    startGapMs?: number
    tabLingerMs?: number
    loggedIn?: boolean
    login?: () => VintedLogin | null
    site?: Partial<Pick<Vinted, 'banner' | 'loginForm' | 'slow'>>
    cookies?: Array<{ name: string; value: string }>
  } = { tabs: 2 }
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-relist-flow-'))
  roots.push(root)
  const photo = await sharp({ create: { width: 8, height: 12, channels: 3, background: '#3355aa' } })
    .jpeg()
    .toBuffer()
  for (const card of CARDS) {
    const cert = /(\d+)_front/.exec(card.product.images[0])![1]
    await fs.mkdir(path.join(root, 'public/ads'), { recursive: true })
    await fs.writeFile(path.join(root, `public/ads/${cert}.jpeg`), photo)
  }

  const site = { ...vinted(CARDS.map((card) => ({ id: card.listingId, title: card.title }))), ...options.site }
  site.loggedIn = options.loggedIn ?? true
  const context = await browser!.newContext()
  contexts.push(context)
  await context.route('https://www.vinted.nl/**', (route) => serve(site, route, context))
  await context.addCookies((options.cookies ?? []).map((cookie) => ({ ...cookie, domain: 'www.vinted.nl', path: '/' })))

  spies.push(
    vi.spyOn(console, 'info').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  )

  let state: VintedRelistState = emptyRelistState()
  const store = relistStateStore({
    get: () => structuredClone(state),
    put: (next) => {
      state = structuredClone(next)
    }
  })
  let opened = 0
  const service = createVintedRelistService({
    root,
    openPage: async () => {
      opened += 1
      return await context.newPage()
    },
    store,
    readMedia: async () => photo,
    login: options.login,
    tabs: options.tabs,
    startGapMs: options.startGapMs ?? 0,
    // Tabs close the moment their relist is done, so each test finds the window as it left it.
    tabLingerMs: options.tabLingerMs ?? 0
  })
  const products = CARDS.map((card) => card.product)
  /** The URLs of the tabs open in the window right now. */
  const tabs = () => context.pages().map((page) => page.url())
  return {
    root,
    site,
    service,
    store,
    products,
    state: () => state,
    opened: () => opened,
    tabs,
    cookies: () => context.cookies('https://www.vinted.nl')
  }
}

const count = (site: Vinted, line: string) => site.requests.filter((request) => request.line === line).length

describe('the relist, in tabs', () => {
  it('relists several listings at once, each in a tab of its own, and the rest in the first tab that comes free', async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 2, startGapMs: 1_000 })

    const relisted = await Promise.all(CARDS.map((card) => h.service.relist(String(card.listingId), h.products)))

    // Every listing came back as a new one with the same title, and the product it belongs to.
    expect(relisted.map((result) => result.productId)).toEqual([1, 2, 3])
    expect(h.site.wardrobe.every((listing) => listing.id >= 5000)).toBe(true)
    const copyOf = (title: string) => h.site.wardrobe.find((listing) => listing.title === title)
    expect(relisted.map((result) => result.itemId)).toEqual(CARDS.map((card) => String(copyOf(card.title)?.id)))
    // An exact copy: what the form posted is what the edit page said.
    expect(
      h.site.uploads
        .map((upload) => [
          upload.title,
          upload.catalogId,
          upload.brandId,
          upload.conditionId,
          upload.packageSizeId,
          upload.price,
          upload.photos
        ])
        .sort()
    ).toEqual(CARDS.map((card) => [card.title, 4875, 191646, 3, 1, '89,99', 2]).sort())

    // Two tabs did the three relists: the third waited for the first to come free,
    // and took that tab over. Done, each closed its tab: none is left in the window.
    expect(h.opened()).toBe(2)
    expect(h.tabs()).toEqual([])
    // Every relist's own record is there — none wrote over the others' — and nothing is left pending.
    const state = h.state()
    expect(Object.keys(state.pending)).toEqual([])
    expect(
      Object.values(state.records)
        .map((record) => record.previousItemId)
        .sort()
    ).toEqual(['1001', '1002', '1003'])

    // Vinted was asked once who is logged in, never for the homepage, and for each
    // listing page once — the tab that landed on it did not load it again.
    expect(count(h.site, 'GET /api/v2/users/current')).toBe(1)
    expect(count(h.site, 'GET /')).toBe(0)
    for (const card of CARDS) {
      expect(count(h.site, `GET /items/${card.listingId}`)).toBe(1)
      expect(count(h.site, `GET /items/${card.listingId}/edit`)).toBe(1)
    }
    // The wardrobe: once to see each delete through, once to find each copy.
    expect(count(h.site, `GET /api/v2/wardrobe/${USER.id}/items`)).toBe(6)

    // No two relists first reached Vinted within the gap of each other. The gap is kept
    // between starts; a tab that was slower to get going under load — the rest of the
    // suite encodes images in parallel — shows up here as a somewhat shorter one.
    const firstContacts = CARDS.map((card) => h.site.requests.find((request) => request.line === `GET /items/${card.listingId}`)!.at).sort()
    expect(firstContacts[1] - firstContacts[0]).toBeGreaterThanOrEqual(750)
    expect(firstContacts[2] - firstContacts[1]).toBeGreaterThanOrEqual(750)
  }, 60_000)

  it('answers the next look at the screen from the wardrobe a relist just read, and says what is still under way', async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 2 })

    const first = h.service.relist('1001', h.products)
    // Refused while the first is on it: a second press must not delete the copy going up.
    await expect(h.service.relist('1001', h.products)).rejects.toMatchObject({ status: 409 })
    const during = await h.service.report(h.products)
    expect(during.relisting).toEqual(['1001'])
    await first

    // The relist's tab is gone; the tab that read the wardrobe stays, on Vinted's homepage.
    expect(h.tabs()).toEqual(['https://www.vinted.nl/'])

    const wardrobeReads = count(h.site, `GET /api/v2/wardrobe/${USER.id}/items`)
    const opened = h.opened()
    const report = await h.service.report(h.products)
    expect(report.relisting).toEqual([])
    expect(report.rows.map((row) => row.title)).toContain(CARDS[0].title)
    expect(report.rows.find((row) => row.title === CARDS[0].title)?.ageDays).toBe(0)
    // Answered from the read that found the copy: no wardrobe call, no tab.
    expect(count(h.site, `GET /api/v2/wardrobe/${USER.id}/items`)).toBe(wardrobeReads)
    expect(h.opened()).toBe(opened)
  }, 60_000)

  it('refuses a listing it relisted under an hour ago, without asking Vinted anything', async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 2 })
    h.store.update((state) => {
      state.records['1001'] = {
        itemId: '1001',
        previousItemId: '900',
        productId: 1,
        listedAt: new Date(Date.now() - 20 * 60_000).toISOString()
      }
    })

    await expect(h.service.relist('1001', h.products)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('40 min') })
    expect(h.site.requests).toEqual([])
    expect(h.opened()).toBe(0)
  }, 60_000)

  it("keeps a done relist's tab for a relist that arrives within the linger, and closes it after", async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 2, tabLingerMs: 2_000 })

    // Nothing was queued behind the first — the next relist reaches the tabs only
    // once the dev server has settled the database, or once its button is pressed —
    // so the tab stays where its relist left it.
    await h.service.relist('1001', h.products)
    expect(h.opened()).toBe(1)
    expect(h.tabs()).toHaveLength(1)

    // The next relist takes that tab over, and from it lands straight on its listing page.
    await h.service.relist('1002', h.products)
    expect(h.opened()).toBe(1)
    expect(count(h.site, 'GET /items/1002')).toBe(1)
    expect(
      Object.values(h.state().records)
        .map((record) => record.previousItemId)
        .sort()
    ).toEqual(['1001', '1002'])

    // Nobody came for it within the linger: it closes.
    await expect.poll(() => h.tabs(), { timeout: 10_000 }).toEqual([])
  }, 60_000)

  it('stops the whole batch on the first "not logged in", without asking Vinted tab by tab', async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 2, loggedIn: false })

    const outcomes = await Promise.allSettled(CARDS.map((card) => h.service.relist(String(card.listingId), h.products)))
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('rejected')
      expect((outcome as PromiseRejectedResult).reason).toMatchObject({ status: 401 })
    }
    // One question, one tab put on the login page; the third relist never touched Vinted.
    expect(count(h.site, 'GET /api/v2/users/current')).toBe(1)
    expect(count(h.site, 'GET /member/login/email')).toBe(1)
    expect(count(h.site, 'GET /items/1003')).toBe(0)
    expect(h.state().pending).toEqual({})
    // The tab on the login page is left open, for the login.
    expect(h.tabs().some((url) => url.startsWith('https://www.vinted.nl/member/login/email'))).toBe(true)
  }, 60_000)

  it("logs the window in with the login from .env once Vinted's session has run out, and relists the whole batch", async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 2, loggedIn: false, login: () => ACCOUNT })

    const relisted = await Promise.all(CARDS.map((card) => h.service.relist(String(card.listingId), h.products)))

    expect(relisted.map((result) => result.productId)).toEqual([1, 2, 3])
    expect(h.site.uploads).toHaveLength(3)
    expect(h.site.wardrobe.every((listing) => listing.id >= 5000)).toBe(true)
    // One login for the whole batch, sent once the cookie banner that came over the form
    // a moment after it was answered — with only the essential cookies.
    expect(count(h.site, 'GET /member/login/email')).toBe(1)
    expect(count(h.site, 'POST /web/api/auth/oauth')).toBe(1)
    expect((await h.cookies()).find((cookie) => cookie.name === 'OptanonConsent')?.value).toBe('groups:essential')
    // The tabs that landed on their listing page before the login saw it without the
    // seller's "Verwijderen", and landed again: every delete went through.
    for (const card of CARDS) {
      expect(count(h.site, `POST /api/v2/items/${card.listingId}/delete`)).toBe(1)
    }
    expect(h.state().pending).toEqual({})
  }, 60_000)

  it('leaves a login Vinted turns down on the screen with its reason, and types it in again only once .env changes', async ({ skip }) => {
    if (!browser) skip()
    let login: VintedLogin = { ...ACCOUNT, password: 'not-the-password' }
    const h = await setUp({ tabs: 2, loggedIn: false, login: () => login })

    const outcomes = await Promise.allSettled(CARDS.map((card) => h.service.relist(String(card.listingId), h.products)))
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('rejected')
      const reason = (outcome as PromiseRejectedResult).reason as { status: number; message: string }
      expect(reason.status).toBe(401)
      expect(reason.message).toContain('Onjuiste gebruikersnaam of wachtwoord.')
      expect(reason.message).not.toContain(login.password)
    }
    expect(count(h.site, 'POST /web/api/auth/oauth')).toBe(1)
    expect(h.state().pending).toEqual({})
    // The tab stays on the form, with Vinted's reason on it, for a person to look at.
    expect(h.tabs().some((url) => url.startsWith('https://www.vinted.nl/member/login/email'))).toBe(true)

    // Past the moment every tab takes the "not logged in" as read: the same login is not typed in again...
    const realNow = Date.now.bind(Date)
    let ahead = 20_000
    spies.push(vi.spyOn(Date, 'now').mockImplementation(() => realNow() + ahead))
    await expect(h.service.relist('1001', h.products)).rejects.toMatchObject({ status: 401 })
    expect(count(h.site, 'POST /web/api/auth/oauth')).toBe(1)

    // ...but the one `.env` holds once it is put right is, at the next relist.
    login = ACCOUNT
    ahead = 40_000
    await expect(h.service.relist('1001', h.products)).resolves.toMatchObject({ productId: 1 })
    expect(count(h.site, 'POST /web/api/auth/oauth')).toBe(2)
  }, 60_000)

  it.for([
    { how: "through OneTrust's own script", banner: { script: true, covered: true } },
    { how: 'by its own button, on a page without that script', banner: { script: false, covered: true } }
  ])(
    'answers the cookie banner $how, where no click from outside the page reaches it, and logs in',
    { timeout: 60_000 },
    async ({ banner }, { skip }) => {
      if (!browser) skip()
      const h = await setUp({ tabs: 1, loggedIn: false, login: () => ACCOUNT, site: { banner } })

      await expect(h.service.relist('1001', h.products)).resolves.toMatchObject({ productId: 1 })
      expect(count(h.site, 'POST /web/api/auth/oauth')).toBe(1)
      expect((await h.cookies()).find((cookie) => cookie.name === 'OptanonConsent')?.value).toBe('groups:essential')
    }
  )

  it("presses the login form's own button when Enter does not send the login", async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 1, loggedIn: false, login: () => ACCOUNT, site: { loginForm: { swallowEnter: true, deadLoads: 0 } } })

    await expect(h.service.relist('1001', h.products)).resolves.toMatchObject({ productId: 1 })
    expect(count(h.site, 'POST /web/api/auth/oauth')).toBe(1)
  }, 60_000)

  it('types a login that never reached Vinted in again at the next relist, and leaves what its tab showed', async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 1, loggedIn: false, login: () => ACCOUNT, site: { loginForm: { swallowEnter: false, deadLoads: 1 } } })

    const failed = (await h.service.relist('1001', h.products).catch((error: unknown) => error)) as { status: number; message: string }
    expect(failed.status).toBe(401)
    expect(failed.message).toContain('did not send the login')
    expect(failed.message).not.toContain('tries that login again in')
    expect(count(h.site, 'POST /web/api/auth/oauth')).toBe(0)
    expect(h.state().pending).toEqual({})

    // What the tab showed is left in the project, for a look that asks Vinted nothing — the password nowhere in it.
    const report = await fs.readFile(path.join(h.root, '.cache/vinted-relist-login.json'), 'utf8')
    expect(JSON.parse(report)).toMatchObject({
      problem: failed.message,
      url: expect.stringContaining('/member/login/email'),
      page: { cookieBanner: { script: true, answered: true, showing: false }, form: { usernameFilled: true, passwordFilled: true } }
    })
    expect(report).not.toContain(ACCOUNT.password)
    expect((await fs.stat(path.join(h.root, '.cache/vinted-relist-login.png'))).size).toBeGreaterThan(0)

    // Nothing holds it back: past the moment every tab takes the "not logged in" as read,
    // the next relist loads the form afresh, types the login in again and gets it through.
    const realNow = Date.now.bind(Date)
    spies.push(vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 20_000))
    await expect(h.service.relist('1001', h.products)).resolves.toMatchObject({ productId: 1 })
    expect(count(h.site, 'GET /member/login/email')).toBe(2)
    expect(count(h.site, 'POST /web/api/auth/oauth')).toBe(1)
  }, 60_000)

  it("clears the window's Vinted cookies once, not once for every tab stuck on the session refresh", async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({
      tabs: 2,
      startGapMs: 1_000,
      cookies: [
        { name: 'refresh_token_web', value: 'stale' },
        { name: 'anon_id', value: '0' }
      ]
    })

    const relisted = await Promise.all(CARDS.slice(0, 2).map((card) => h.service.relist(String(card.listingId), h.products)))

    expect(relisted.map((result) => result.productId)).toEqual([1, 2])
    // Both tabs found the refresh stuck; the second landed while the first was still
    // waiting it out, and only went again once the first had cleared the cookies —
    // one new anon_id since, where clearing them twice hands out two.
    expect(h.site.stuckRefreshes).toBe(2)
    expect(h.site.anonIds).toBe(1)
  }, 60_000)

  it('stops a relist at its next step once Vinted has rate-limited another tab, with its state written down', async ({ skip }) => {
    if (!browser) skip()
    const h = await setUp({ tabs: 1 })

    const relist = h.service.relist('1001', h.products)
    // Once the delete has gone through, another tab runs into the rate limit.
    await vi.waitFor(() => expect(count(h.site, 'POST /api/v2/items/1001/delete')).toBe(1), { timeout: 30_000 })
    h.store.update((state) => {
      state.cooldownUntil = new Date(Date.now() + 30 * 60_000).toISOString()
    })

    await expect(relist).rejects.toMatchObject({ status: 429 })
    expect(count(h.site, 'GET /items/new')).toBe(0)
    const pending = h.state().pending['1001']
    expect(pending.deletedAt).not.toBe('')
    expect(pending.error).toMatch(/rate-limited/)
    expect(pending.snapshot.title).toBe(CARDS[0].title)
    // A relist that stopped leaves its tab as it is, to be looked at: where Vinted took
    // it once the listing was gone.
    expect(h.tabs()).toEqual([`https://www.vinted.nl/member/${USER.id}`])
  }, 60_000)

  it('carries on when Vinted takes the tab off the deleted listing in the middle of the read that checks the delete', async ({ skip }) => {
    if (!browser) skip()
    // Vinted takes the tab to the seller's page a moment after the delete, and that page
    // comes in just after the relist has started asking the wardrobe whether the
    // listing is gone — which a navigation takes along with the page it leaves.
    const h = await setUp({
      tabs: 1,
      site: { slow: { leaveDeletedListingMs: 1_500, sellerPageMs: 1_000, wardrobeMs: 1_500, newListingShownAfterMs: 0 } }
    })

    await expect(h.service.relist('1001', h.products)).resolves.toMatchObject({ productId: 1 })
    expect(count(h.site, 'POST /api/v2/items/1001/delete')).toBe(1)
    expect(h.site.uploads).toHaveLength(1)
    expect(h.state().pending).toEqual({})
  }, 60_000)

  it("does not put a card up twice when a retry finds the copy an earlier go got up, and leaves what the stopped go's tab showed", async ({
    skip
  }) => {
    if (!browser) skip()
    // Vinted takes the upload, but its wardrobe only shows the new listing a while later.
    const h = await setUp({
      tabs: 1,
      site: { slow: { leaveDeletedListingMs: 0, sellerPageMs: 0, wardrobeMs: 0, newListingShownAfterMs: 5_000 } }
    })

    const failed = (await h.service.relist('1001', h.products).catch((error: unknown) => error)) as { message: string }
    expect(failed.message).toContain('does not show it yet')
    expect(h.site.uploads).toHaveLength(1)
    expect(h.state().pending['1001'].deletedAt).not.toBe('')

    // Where it stopped and why, with the pages the tab went to, is left in the project.
    const dir = path.join(h.root, '.cache/vinted-relist-failures')
    const reports = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'))
    expect(reports).toHaveLength(1)
    const report = JSON.parse(await fs.readFile(path.join(dir, reports[0]), 'utf8')) as Record<string, unknown>
    expect(report).toMatchObject({ itemId: '1001', step: 'uploading the new listing', deleted: true, error: failed.message })
    expect(report.tab).toContainEqual(expect.stringContaining(`on https://www.vinted.nl/member/${USER.id}?promo_shown=true`))
    expect((await fs.stat(path.join(dir, reports[0].replace(/\.json$/, '.png')))).size).toBeGreaterThan(0)

    // Once the wardrobe shows it, the retry finds the copy and takes it, rather than
    // uploading the card a second time.
    await sleep(2_500)
    const copy = h.site.wardrobe.find((listing) => listing.id >= 5000)!
    await expect(h.service.relist('1001', h.products)).resolves.toMatchObject({ itemId: String(copy.id), productId: 1 })
    expect(h.site.uploads).toHaveLength(1)
    expect(h.state().pending).toEqual({})
    expect(h.state().records[String(copy.id)]).toMatchObject({ previousItemId: '1001', productId: 1 })
  }, 60_000)
})
