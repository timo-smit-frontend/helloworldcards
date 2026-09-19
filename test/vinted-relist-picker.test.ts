import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { VintedSnapshot } from '../app/services/vinted-relist'
import { pickBrand, pickCategory, pickCondition } from '../vite/vinted-relist'

/**
 * A stand-in for the category picker on Vinted's upload form, with what the walk
 * relies on: a read-only field, a dropdown that is only in the DOM while open, one
 * level of cells at a time with `#catalog-<id>` on each, a "Suggesties" block at the
 * root once the photos were recognised, and the prefill that recognition does —
 * which sets the field and puts the picker back at its root, even while it is open.
 * A prefill after the seller's own pick is ignored, as Vinted ignores it.
 *
 * Below it, the brand and condition fields as Vinted has them: a field shows a
 * spinner and ignores clicks while what it lists is on its way. The brand picker
 * lists the popular brands of the category, fetched half a second after the
 * category changes, and searches the rest; the condition field is one of the
 * category's attributes and is not on the form until those are in.
 */
const TREE = [
  { id: 1904, title: 'Dames' },
  {
    id: 4824,
    title: "Hobby's & verzamelen",
    catalogs: [
      {
        id: 4874,
        title: 'Ruilkaarten',
        catalogs: [
          { id: 4875, title: 'Losse ruilkaarten' },
          { id: 4876, title: 'Verzegelde ruilkaarten' }
        ]
      },
      { id: 4881, title: 'Bordspellen' }
    ]
  }
]

type FixtureOptions = {
  /** The field already reads this category when the form is reached. */
  prefilled?: number
  /** Recognition answers while the walk is on this level: the field is prefilled and the picker jumps back to its root. */
  prefillWhenOn?: number
  /** The picker shuts (as it does on a click outside it) once the walk reaches this level. */
  closeWhenOn?: number
  /** This cell is simply not rendered, the way a renamed or moved category would not be. */
  hide?: number
  /** The field shows Vinted's spinner, and ignores clicks, for this long. */
  loaderMs?: number
  /** How long after a category change the brand field starts fetching the category's brands. */
  brandDebounceMs?: number
  /** How long that fetch takes; the field spins and ignores clicks meanwhile. */
  brandFetchMs?: number
  /** Pokémon is not among the category's popular brands, so it has to be searched for. */
  brandNotPopular?: boolean
  /** How long after a category change the category's attributes, the condition field among them, are on the form. */
  attributesMs?: number
}

const FIXTURE = String.raw`<!doctype html>
<html><body>
<label for="category">Categorie</label>
<div>
  <input id="category" data-testid="catalog-select-dropdown-input" readonly placeholder="Kies een categorie">
  <span id="icon"></span>
</div>
<div id="dropdown"></div>
<div>
  <label for="brand">Merk</label>
  <input id="brand" data-testid="brand-select-dropdown-input" readonly placeholder="Selecteer een merk">
  <span id="brand-icon"></span>
  <div id="brand-dropdown"></div>
</div>
<div id="attributes"></div>
<script>
  const options = window.__options
  const byId = {}
  const parentOf = {}
  const roots = []
  const index = (nodes, parent) => nodes.forEach((node) => { byId[node.id] = node; parentOf[node.id] = parent; (parent ? [] : roots).push(node.id); index(node.catalogs || [], node.id) })
  index(window.__tree, null)
  const children = (id) => (id === null ? roots.map((rootId) => byId[rootId]) : byId[id].catalogs || [])
  const pathOf = (id) => { const titles = []; for (let at = parentOf[id]; at; at = parentOf[at]) titles.unshift(byId[at].title); return titles.join(' › ') }

  const state = { open: false, pageId: null, catalogId: options.prefilled ?? null, selected: false, suggestions: options.prefilled ? [options.prefilled] : [], loading: (options.loaderMs || 0) > 0 }
  const log = []
  window.__state = state
  window.__log = log
  let prefilledOnce = false
  let closedOnce = false

  // The brand and condition fields, which follow the category.
  const ALL_BRANDS = { 1: 'Nike', 2: 'Zara', 5: 'Yu-Gi-Oh!', 191646: 'Pokémon', 7: 'Pokémon Center' }
  const popularFor = (catalogId) => (catalogId === 4875 ? (options.brandNotPopular ? [5] : [191646, 5]) : [1, 2])
  const brand = { open: false, loading: false, brands: popularFor(null), brandId: null, search: '', results: null, searches: [] }
  const condition = { ready: options.prefilled != null, open: false, conditionId: null }
  Object.assign(state, { brand, condition })
  const CONDITIONS = { 1: 'Nieuw met prijskaartje', 2: 'Nieuw zonder prijskaartje', 3: 'Heel goed', 4: 'Goed' }
  function categoryChanged() {
    const fetchBrands = () => {
      brand.loading = true
      renderBrand()
      setTimeout(() => { brand.loading = false; brand.brands = popularFor(state.catalogId); renderBrand() }, options.brandFetchMs ?? 700)
    }
    const debounce = options.brandDebounceMs ?? 500
    if (debounce > 0) setTimeout(fetchBrands, debounce)
    else fetchBrands()
    if (!condition.ready) setTimeout(() => { condition.ready = true; renderCondition() }, options.attributesMs ?? 800)
  }

  const input = document.getElementById('category')
  const icon = document.getElementById('icon')
  const dropdown = document.getElementById('dropdown')
  const el = (tag, attributes = {}, text) => { const node = document.createElement(tag); for (const [name, value] of Object.entries(attributes)) if (value !== undefined) node.setAttribute(name, value); if (text) node.textContent = text; return node }
  const cellOf = (id, role, checked) => { const cell = el('div', { id, role, 'aria-checked': checked }); cell.style.padding = '8px'; return cell }

  function render() {
    input.value = state.catalogId ? byId[state.catalogId].title : ''
    icon.innerHTML = ''
    icon.append(state.loading ? el('div', { 'data-testid': 'catalog-select-dropdown--loader' }, '…') : el('div', { 'data-testid': 'catalog-select-dropdown-chevron-down' }, 'v'))
    dropdown.innerHTML = ''
    if (!state.open) return
    const content = el('div', { 'data-testid': 'catalog-select-dropdown-content' })
    if (state.pageId === null && state.suggestions.length) {
      content.append(el('div', {}, 'Suggesties'))
      const list = el('ul')
      for (const id of state.suggestions) {
        const cell = cellOf('catalog-suggestion-' + id, 'radio', String(id === state.catalogId))
        cell.append(el('div', {}, byId[id].title), el('div', {}, pathOf(id)))
        cell.onclick = () => select(id, 'suggestion')
        const item = el('li'); item.append(cell); list.append(item)
      }
      content.append(list, el('div', {}, 'Alle categorieën'))
    }
    const list = el('ul', { 'data-testid': 'category-list' })
    for (const node of children(state.pageId)) {
      if (node.id === options.hide) continue
      const leaf = !(node.catalogs && node.catalogs.length)
      const cell = cellOf('catalog-' + node.id, leaf ? 'radio' : undefined, leaf ? String(node.id === state.catalogId) : undefined)
      cell.append(el('div', {}, node.title))
      cell.onclick = () => (leaf ? select(node.id, 'default') : navigate(node.id))
      const item = el('li'); item.append(cell); list.append(item)
    }
    content.append(list)
    dropdown.append(content)
  }

  function navigate(id) {
    log.push('navigate:' + id)
    state.pageId = id
    render()
    if (options.prefillWhenOn === id && !prefilledOnce) { prefilledOnce = true; prefill(options.prefilled ?? 4875) }
    if (options.closeWhenOn === id && !closedOnce) { closedOnce = true; close() }
  }
  function select(id, source) {
    log.push('select:' + id + ':' + source)
    const changed = state.catalogId !== id
    state.catalogId = id
    state.selected = true
    close()
    if (changed) categoryChanged()
  }
  // Shutting the picker forgets the level it was on, as Vinted's does.
  function close() {
    state.open = false
    state.pageId = null
    render()
  }
  function prefill(id) {
    if (state.selected) return
    log.push('prefill:' + id)
    const changed = state.catalogId !== id
    state.catalogId = id
    state.pageId = null
    state.suggestions = [id]
    render()
    if (changed) categoryChanged()
  }
  input.onclick = () => { if (state.open || state.loading) return; state.open = true; render() }
  if (state.loading) setTimeout(() => { state.loading = false; render() }, options.loaderMs)
  render()

  const brandInput = document.getElementById('brand')
  const brandIcon = document.getElementById('brand-icon')
  const brandDropdown = document.getElementById('brand-dropdown')
  function renderBrand() {
    brandInput.value = brand.brandId ? ALL_BRANDS[brand.brandId] : ''
    brandIcon.innerHTML = ''
    brandIcon.append(brand.loading ? el('div', { 'data-testid': 'brand-select-dropdown--loader' }, '…') : el('div', { 'data-testid': 'brand-select-dropdown-chevron-down' }, 'v'))
    brandDropdown.innerHTML = ''
    if (!brand.open) return
    const content = el('div', { 'data-testid': 'brand-select-dropdown-content' })
    const search = el('input', { 'data-testid': 'brand-search--input', placeholder: 'Zoek een merk' })
    search.value = brand.search
    search.oninput = () => {
      brand.search = search.value
      brand.searches.push(search.value)
      setTimeout(() => { brand.results = Object.keys(ALL_BRANDS).filter((id) => ALL_BRANDS[id].toLowerCase().includes(brand.search.toLowerCase())).map(Number); renderBrand(); brandDropdown.querySelector('[data-testid="brand-search--input"]').focus() }, 200)
    }
    content.append(search, el('div', {}, brand.results ? 'Resultaten' : 'Populaire merken'))
    const list = el('ul')
    for (const id of brand.results ?? brand.brands) {
      const cell = cellOf('brand-' + id, 'radio', String(id === brand.brandId))
      cell.append(el('div', {}, ALL_BRANDS[id]))
      cell.onclick = () => { log.push('brand:' + id); brand.brandId = id; brand.open = false; brand.search = ''; brand.results = null; renderBrand() }
      const item = el('li'); item.append(cell); list.append(item)
    }
    content.append(list)
    brandDropdown.append(content)
  }
  brandInput.onclick = () => { if (brand.open) return; if (brand.loading) { log.push('brand-click-ignored'); return } brand.open = true; renderBrand() }
  renderBrand()

  const attributes = document.getElementById('attributes')
  function renderCondition() {
    attributes.innerHTML = ''
    if (!condition.ready) return
    const field = el('input', { id: 'condition', 'data-testid': 'category-condition-single-list-input', readonly: '', placeholder: 'Selecteer de staat' })
    field.value = condition.conditionId ? CONDITIONS[condition.conditionId] : ''
    field.onclick = () => { if (condition.open) return; condition.open = true; renderCondition() }
    attributes.append(el('label', {}, 'Staat'), field)
    if (!condition.open) return
    const content = el('div', { 'data-testid': 'category-condition-single-list-content' })
    const list = el('ul')
    for (const id of Object.keys(CONDITIONS).map(Number)) {
      const cell = cellOf('condition-' + id, 'radio', String(id === condition.conditionId))
      cell.append(el('div', {}, CONDITIONS[id]))
      cell.onclick = () => { log.push('condition:' + id); condition.conditionId = id; condition.open = false; renderCondition() }
      const item = el('li'); item.append(cell); list.append(item)
    }
    content.append(list)
    attributes.append(content)
  }
  renderCondition()
</script>
</body></html>`

let browser: Browser | null = null

beforeAll(async () => {
  // The relist drives the installed Google Chrome, so the test does too; without one there is nothing to test against.
  browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => null)
})

afterAll(async () => {
  await browser?.close()
})

async function uploadForm(options: FixtureOptions): Promise<Page> {
  const page = await browser!.newPage()
  await page.route('https://vinted.test/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v2/item_upload/catalogs') {
      await route.fulfill({ json: { catalogs: TREE } })
    } else {
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: FIXTURE.replace('window.__options', JSON.stringify(options)).replace('window.__tree', JSON.stringify(TREE))
      })
    }
  })
  await page.goto('https://vinted.test/items/new')
  return page
}

type Fixture = { log: string[]; value: string; selected: boolean; open: boolean }
type Details = { brandId: number | null; searches: string[]; conditionId: number | null; ignoredClicks: number }

async function fixture(page: Page): Promise<Fixture> {
  return await page.evaluate(() => {
    const w = window as unknown as { __log: string[]; __state: { selected: boolean; open: boolean } }
    return {
      log: w.__log,
      value: (document.querySelector('[data-testid="catalog-select-dropdown-input"]') as HTMLInputElement).value,
      selected: w.__state.selected,
      open: w.__state.open
    }
  })
}

async function details(page: Page): Promise<Details> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __log: string[]
      __state: { brand: { brandId: number | null; searches: string[] }; condition: { conditionId: number | null } }
    }
    return {
      brandId: w.__state.brand.brandId,
      searches: w.__state.brand.searches,
      conditionId: w.__state.condition.conditionId,
      ignoredClicks: w.__log.filter((entry) => entry === 'brand-click-ignored').length
    }
  })
}

const SNAPSHOT: VintedSnapshot = {
  itemId: '9878696344',
  title: 'Mewtwo Reverse 51/108 – PSA 9 – XY Evolutions',
  description: 'Mooie Mewtwo.',
  catalogId: 4875,
  brandId: 191646,
  brandTitle: 'Pokémon',
  conditionId: 3,
  packageSizeId: 1,
  price: 89.99,
  isUnisex: false,
  colorIds: [],
  photos: []
}

const LEAF = 4875
const WALK = ['navigate:4824', 'navigate:4874', 'select:4875:default']

describe.concurrent('upload form pickers', () => {
  it('walks the picker down to the leaf by id and leaves the field reading it', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({})
    await pickCategory(page, LEAF)
    expect(await fixture(page)).toEqual({ log: WALK, value: 'Losse ruilkaarten', selected: true, open: false })
    await page.close()
  }, 20_000)

  it('walks again from the top when the photo prefill puts the picker back at its root mid-walk', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({ prefillWhenOn: 4824 })
    await pickCategory(page, LEAF)
    // The first walk lost its level to the prefill; the second went all the way, and
    // its own click on the leaf is what counts as the seller's choice.
    expect(await fixture(page)).toEqual({
      log: ['navigate:4824', 'prefill:4875', ...WALK],
      value: 'Losse ruilkaarten',
      selected: true,
      open: false
    })
    await page.close()
  }, 20_000)

  it('still clicks the leaf itself when the field was prefilled before the picker was opened', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({ prefilled: LEAF })
    await pickCategory(page, LEAF)
    // The suggestion row at the root reads the same title, and is not what gets clicked.
    expect(await fixture(page)).toEqual({ log: WALK, value: 'Losse ruilkaarten', selected: true, open: false })
    await page.close()
  }, 20_000)

  it('reopens a picker that shut mid-walk', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({ closeWhenOn: 4824 })
    await pickCategory(page, LEAF)
    expect(await fixture(page)).toEqual({ log: ['navigate:4824', ...WALK], value: 'Losse ruilkaarten', selected: true, open: false })
    await page.close()
  }, 20_000)

  it('waits for the spinner in the field to go before opening it', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({ loaderMs: 600 })
    await pickCategory(page, LEAF)
    expect(await fixture(page)).toEqual({ log: WALK, value: 'Losse ruilkaarten', selected: true, open: false })
    await page.close()
  }, 20_000)

  it('reports a cell that is gone from its level, without walking again', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({ hide: LEAF })
    await expect(pickCategory(page, LEAF)).rejects.toThrow('Vinted\'s category picker does not show "Losse ruilkaarten" where it used to.')
    expect((await fixture(page)).log).toEqual(['navigate:4824', 'navigate:4874'])
    await page.close()
  }, 20_000)

  it('names a category the tree no longer has', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({})
    await expect(pickCategory(page, 999)).rejects.toThrow("Vinted's category tree has no category 999 any more.")
    await page.close()
  }, 20_000)

  it("picks the brand from the category's brands, which arrive after the picker was opened", async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({})
    await pickCategory(page, LEAF)
    await pickBrand(page, SNAPSHOT)
    await pickCondition(page, 3)
    // The brand picker opened on the old brands and spun while the category's came in; no search was needed.
    expect(await details(page)).toEqual({ brandId: 191646, searches: [], conditionId: 3, ignoredClicks: 0 })
    await page.close()
  }, 20_000)

  it("waits out the brand field's spinner instead of clicking into it", async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({ brandDebounceMs: 0, brandFetchMs: 1_500 })
    await pickCategory(page, LEAF)
    await pickBrand(page, SNAPSHOT)
    expect(await details(page)).toMatchObject({ brandId: 191646, searches: [], ignoredClicks: 0 })
    await page.close()
  }, 20_000)

  it('searches for a brand the category does not list', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({ brandNotPopular: true })
    await pickCategory(page, LEAF)
    await pickBrand(page, SNAPSHOT)
    expect(await details(page)).toMatchObject({ brandId: 191646, searches: ['Pokémon'] })
    await page.close()
  }, 20_000)

  it('reports a brand the picker no longer offers', async ({ skip }) => {
    if (!browser) skip()
    const page = await uploadForm({ brandNotPopular: true })
    await pickCategory(page, LEAF)
    await expect(pickBrand(page, { ...SNAPSHOT, brandId: 999, brandTitle: 'Bulbasaur' })).rejects.toThrow(
      "Vinted's brand picker no longer offers Bulbasaur."
    )
    await page.close()
  }, 30_000)
})
