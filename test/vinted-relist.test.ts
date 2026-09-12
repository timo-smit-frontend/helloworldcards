import { describe, expect, it } from 'vitest'
import type { InventoryProduct } from '../app/database/products'
import {
  buildRelistReport,
  catalogPathTo,
  cooldownRemainingMs,
  dutchRelativeDays,
  emptyRelistState,
  listingsWithoutAge,
  normalizeRelistState,
  pageLooksRateLimited,
  parseVintedSnapshot,
  parseVintedUploadedText,
  parseWardrobeItems,
  vintedFlightData,
  vintedItemId,
  vintedPriceInput,
  wardrobeUploadedAt,
  type VintedRelistService,
  type VintedRelistReport
} from '../app/services/vinted-relist'
import { handleDashboardRequest } from '../worker/dashboard-api'
import { SESSION_COOKIE } from '../worker/session'
import { createMemoryD1 } from './helpers/memory-d1'

/** Wrap flight data the way Next.js writes it: a JS string literal pushed from a script. */
function rscPage(...chunks: string[]): string {
  const scripts = chunks.map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`)
  return `<!DOCTYPE html><html><body>${scripts.join('')}</body></html>`
}

const EDIT_MODEL = {
  id: 9878696344,
  title: 'Mewtwo Reverse 51/108 – PSA 9 – XY Evolutions',
  description: 'Mooie Mewtwo.\n\nDetails:\n• Grade: PSA 9',
  colorIds: [],
  sizeId: null,
  catalogId: 4875,
  packageSizeId: 1,
  brand: { id: 191646, title: 'Pokémon', isHvf: false },
  brandId: 191646,
  status: '$undefined',
  currency: 'EUR',
  price: 89.99,
  isUnisex: false,
  itemAttributes: [{ ids: [1], code: 'condition' }]
}

const EDIT_PHOTOS = [
  { id: 42154042577, url: 'https://images1.vinted.net/tc/05_0257f/f800/1789158391.webp?s=45a3\\u0026x=1', tempUuid: '$undefined' },
  { id: 42154042579, url: 'https://images1.vinted.net/tc/06_01d21/f800/1789158391.webp?s=4d59', tempUuid: '$undefined' }
]

function editPage(): string {
  const head = 'a1:["$","$La2",null,{"config":{"numberOfImagesPerItem":20},"itemEditModel":'
  const tail = ',"parcelModel":"$undefined","photos":' + JSON.stringify(EDIT_PHOTOS) + ',"children":"$Lc0"}]\n'
  // Split across two pushes, the way a long page arrives.
  const whole = head + JSON.stringify(EDIT_MODEL) + tail
  return rscPage(whole.slice(0, 120), whole.slice(120))
}

describe('vinted listing ids', () => {
  it('reads the item id off every shape of Vinted URL', () => {
    expect(vintedItemId('https://www.vinted.nl/items/9878696344')).toBe('9878696344')
    expect(vintedItemId('https://www.vinted.nl/items/9878696344-mewtwo-reverse?ref=1')).toBe('9878696344')
    expect(vintedItemId('9878696344')).toBe('9878696344')
    expect(vintedItemId('https://www.marktplaats.nl/v/1234')).toBeNull()
  })

  it('types the price with a comma, as the form expects', () => {
    expect(vintedPriceInput(89.99)).toBe('89,99')
    expect(vintedPriceInput(120)).toBe('120,00')
  })
})

describe('parseVintedSnapshot', () => {
  it('reads the edit model and its photos out of the RSC payload', () => {
    const snapshot = parseVintedSnapshot(editPage())
    expect(snapshot).toEqual({
      itemId: '9878696344',
      title: 'Mewtwo Reverse 51/108 – PSA 9 – XY Evolutions',
      description: 'Mooie Mewtwo.\n\nDetails:\n• Grade: PSA 9',
      catalogId: 4875,
      brandId: 191646,
      brandTitle: 'Pokémon',
      conditionId: 1,
      packageSizeId: 1,
      price: 89.99,
      isUnisex: false,
      colorIds: [],
      photos: [
        { id: 42154042577, url: 'https://images1.vinted.net/tc/05_0257f/f800/1789158391.webp?s=45a3&x=1' },
        { id: 42154042579, url: 'https://images1.vinted.net/tc/06_01d21/f800/1789158391.webp?s=4d59' }
      ]
    })
  })

  it('joins the pushed chunks back into one payload', () => {
    expect(vintedFlightData(rscPage('ab"c', 'd\\e'))).toBe('ab"cd\\e')
  })

  it('gives up on a page without the edit model', () => {
    expect(parseVintedSnapshot(rscPage('0:{"P":null}'))).toBeNull()
    expect(parseVintedSnapshot('<html>Session refresh</html>')).toBeNull()
  })
})

describe('listing age', () => {
  it('finds the upload wording on the listing page', () => {
    const page = rscPage('x:[{"type":"text","code":"upload_date","data":{"title":"Geüpload","value":"een week geleden"}}]')
    expect(parseVintedUploadedText(page)).toBe('een week geleden')
    // The browser hands back a window of the raw page with its quotes unescaped.
    expect(parseVintedUploadedText('"code":"upload_date","data":{"title":"Geüpload","value":"3 dagen geleden"}}')).toBe('3 dagen geleden')
    expect(parseVintedUploadedText(rscPage('nothing here'))).toBeNull()
  })

  it('turns Dutch relative wording into days', () => {
    expect(dutchRelativeDays('zojuist')).toBe(0)
    expect(dutchRelativeDays('5 minuten geleden')).toBe(0)
    expect(dutchRelativeDays('een uur geleden')).toBe(0)
    expect(dutchRelativeDays('gisteren')).toBe(1)
    expect(dutchRelativeDays('een dag geleden')).toBe(1)
    expect(dutchRelativeDays('3 dagen geleden')).toBe(3)
    expect(dutchRelativeDays('een week geleden')).toBe(7)
    expect(dutchRelativeDays('2 weken geleden')).toBe(14)
    expect(dutchRelativeDays('een maand geleden')).toBe(30)
    expect(dutchRelativeDays('2 jaar geleden')).toBe(730)
    expect(dutchRelativeDays('onbekend')).toBeNull()
    expect(dutchRelativeDays(null)).toBeNull()
  })
})

describe('catalogPathTo', () => {
  it('walks the tree down to the leaf', () => {
    const tree = [
      { id: 1904, title: 'Dames' },
      {
        id: 4824,
        title: "Hobby's & verzamelen",
        catalogs: [
          { id: 4874, title: 'Ruilkaarten', catalogs: [{ id: 4875, title: 'Losse ruilkaarten' }] },
          { id: 4881, title: 'Bordspellen' }
        ]
      }
    ]
    expect(catalogPathTo(tree, 4875)?.map((node) => node.title)).toEqual(["Hobby's & verzamelen", 'Ruilkaarten', 'Losse ruilkaarten'])
    expect(catalogPathTo(tree, 1904)?.map((node) => node.id)).toEqual([1904])
    expect(catalogPathTo(tree, 999)).toBeNull()
  })
})

function product(overrides: Partial<InventoryProduct> & { id: number; title: string }): InventoryProduct {
  return { subtitle: '', description: '', images: [], slug: `p-${overrides.id}`, ...overrides }
}

describe('buildRelistReport', () => {
  const wardrobe = parseWardrobeItems({
    items: [
      {
        id: 111,
        title: 'Old card',
        price: { amount: '89.99' },
        view_count: 40,
        favourite_count: 2,
        photos: [{ url: 'https://img/1.jpg' }]
      },
      { id: 222, title: 'Fresh card', price: { amount: '54.99' }, is_reserved: true },
      { id: 333, title: 'Nobody knows', price: '12.00' },
      {
        id: 444,
        title: 'Stamped card',
        price: '20.00',
        photos: [{ url: 'https://img/4.jpg', high_resolution: { timestamp: Date.UTC(2026, 8, 2, 9) / 1000 } }]
      }
    ]
  })

  it('joins the wardrobe to the shop and sorts the oldest first', () => {
    const now = new Date('2026-09-12T12:00:00Z')
    const state = emptyRelistState()
    state.records['222'] = { itemId: '222', previousItemId: '2', productId: 2, listedAt: '2026-09-11T08:00:00Z' }
    // Read off the listing pages three days ago; the words have aged since.
    state.ages['111'] = { text: 'een week geleden', readAt: '2026-09-09T12:00:00Z' }
    state.ages['333'] = { text: 'nog nooit', readAt: '2026-09-09T12:00:00Z' }

    const report = buildRelistReport({
      wardrobe,
      products: [
        product({ id: 1, title: 'Mewtwo', vintedUrl: 'https://www.vinted.nl/items/111-mewtwo' }),
        product({ id: 2, title: 'Dragonite', vintedUrl: 'https://www.vinted.nl/items/222' }),
        product({ id: 3, title: 'Gone', vintedUrl: 'https://www.vinted.nl/items/999' }),
        product({ id: 4, title: 'Concept', vintedUrl: 'https://www.vinted.nl/items/555', concept: true })
      ],
      state,
      login: 'helloworldcards',
      now
    })

    // Both ten days old (the note is three days older than its words); the title breaks the tie.
    expect(report.rows.map((row) => [row.itemId, row.ageDays, row.ageText, row.status])).toEqual([
      ['111', 10, 'een week geleden', 'live'],
      ['444', 10, null, 'live'],
      ['222', 1, null, 'reserved'],
      ['333', null, 'nog nooit', 'live']
    ])
    expect(report.rows[1].listedAt).toBe('2026-09-02T09:00:00.000Z')
    expect(report.rows[0]).toMatchObject({
      url: 'https://www.vinted.nl/items/111',
      price: 89.99,
      views: 40,
      favourites: 2,
      imageUrl: 'https://img/1.jpg',
      product: { id: 1, title: 'Mewtwo', slug: 'p-1' }
    })
    expect(report.rows[2].listedAt).toBe('2026-09-11T08:00:00Z')
    expect(report.rows[3].product).toBeNull()
    // A product whose listing is gone is flagged; a concept product is not expected on Vinted.
    expect(report.missing).toEqual([{ product: { id: 3, title: 'Gone', slug: 'p-3' }, url: 'https://www.vinted.nl/items/999' }])
    expect(report.login).toBe('helloworldcards')
  })

  it('only wants a listing page read when nothing on hand tells the age', () => {
    const now = new Date('2026-09-12T12:00:00Z')
    const state = emptyRelistState()
    state.records['222'] = { itemId: '222', previousItemId: '2', productId: 2, listedAt: '2026-09-11T08:00:00Z' }
    state.ages['333'] = { text: null, readAt: '2026-09-09T12:00:00Z' }
    // 111 has no record, no stamp and no note; 444 carries its photo stamp.
    expect(listingsWithoutAge(wardrobe, state, now)).toEqual(['111'])
  })

  it('believes a photo stamp only when it is a plausible past date', () => {
    const now = new Date('2026-09-12T12:00:00Z')
    const stamped = (timestamp: unknown) =>
      wardrobeUploadedAt({ id: 1, title: 'x', photos: [{ high_resolution: { timestamp: timestamp as number } }] }, now)
    expect(stamped(Date.UTC(2026, 8, 2) / 1000)).toBe(Date.UTC(2026, 8, 2))
    expect(stamped(Date.UTC(2027, 0, 1) / 1000)).toBeNull()
    expect(stamped(12345)).toBeNull()
    expect(stamped('1757000000')).toBeNull()
    expect(wardrobeUploadedAt({ id: 1, title: 'x' }, now)).toBeNull()
  })

  it('lists a deleted-but-not-reuploaded listing as pending, not as missing', () => {
    const state = emptyRelistState()
    state.pending['444'] = {
      snapshot: {
        itemId: '444',
        title: 'Gone card',
        description: '',
        catalogId: 4875,
        brandId: null,
        brandTitle: null,
        conditionId: null,
        packageSizeId: null,
        price: 10,
        isUnisex: false,
        colorIds: [],
        photos: []
      },
      productId: 3,
      photoFiles: [],
      deletedAt: '2026-09-12T10:00:00Z',
      error: 'Vinted did not publish the listing.'
    }
    const report = buildRelistReport({
      wardrobe: [],
      products: [product({ id: 3, title: 'Gone', vintedUrl: 'https://www.vinted.nl/items/444' })],
      state,
      login: null
    })
    expect(report.pending).toEqual([
      {
        itemId: '444',
        title: 'Gone card',
        deletedAt: '2026-09-12T10:00:00Z',
        error: 'Vinted did not publish the listing.',
        product: { id: 3, title: 'Gone', slug: 'p-3' }
      }
    ])
    expect(report.missing).toEqual([])
  })
})

describe('rate limiting', () => {
  it('recognises the page Vinted serves once a computer has asked too much', () => {
    expect(
      pageLooksRateLimited(
        'You are rate limited',
        'We are sorry, but access to this site is blocked for this computer, due to too many requests.'
      )
    ).toBe(true)
    expect(pageLooksRateLimited('Zorua 140/086 AR | Vinted', 'Mooie Zorua Art Rare uit de Japanse Pokémon White Flare set.')).toBe(false)
  })

  it('leaves Vinted alone until the cool-down has lapsed', () => {
    const now = new Date('2026-09-12T22:00:00Z')
    expect(cooldownRemainingMs(emptyRelistState(), now)).toBe(0)
    expect(cooldownRemainingMs({ cooldownUntil: '2026-09-12T22:20:00Z' }, now)).toBe(20 * 60_000)
    expect(cooldownRemainingMs({ cooldownUntil: '2026-09-12T21:00:00Z' }, now)).toBe(0)
    expect(cooldownRemainingMs({ cooldownUntil: 'garbage' }, now)).toBe(0)
  })

  it('reads a state file from before ages and cool-downs were kept', () => {
    expect(normalizeRelistState({ records: {}, pending: {} })).toEqual(emptyRelistState())
    expect(normalizeRelistState(null)).toEqual(emptyRelistState())
  })
})

const env = {
  DASHBOARD_USERNAME: 'sam',
  DASHBOARD_PASSWORD: 'correct-horse',
  DASHBOARD_SESSION_SECRET: 'session-secret-for-tests'
}

async function signIn(): Promise<string> {
  const login = await handleDashboardRequest(
    new Request('https://example.com/dashboard/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
    }),
    env
  )
  return login!.headers.get('Set-Cookie')!.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))![1]
}

function emptyReport(): VintedRelistReport {
  return { rows: [], pending: [], missing: [], login: 'helloworldcards', fetchedAt: '2026-09-12T12:00:00Z' }
}

describe('vinted relist API', () => {
  it('is only offered where a Chrome window can drive Vinted', async () => {
    const token = await signIn()
    const response = await handleDashboardRequest(
      new Request('https://example.com/api/admin/vinted-relist', { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db: createMemoryD1() }
    )
    expect(response?.status).toBe(404)
    await expect(response?.json()).resolves.toEqual({ error: 'Vinted relisting only runs locally.' })
  })

  it('needs a session, like every other dashboard route', async () => {
    const response = await handleDashboardRequest(
      new Request('https://example.com/dashboard/vinted-relist/9878696344', { method: 'POST' }),
      env
    )
    expect(response?.status).toBe(401)
  })

  it('relists through the service and moves the product to the new listing', async () => {
    const token = await signIn()
    const db = createMemoryD1()
    const calls: string[] = []
    const vintedRelist: VintedRelistService = {
      async report() {
        return emptyReport()
      },
      async relist(itemId, products) {
        calls.push(itemId)
        const owner = products.find((candidate) => candidate.vintedUrl?.includes(`/items/${itemId}`))
        return { itemId: '9999', url: 'https://www.vinted.nl/items/9999', productId: owner?.id ?? null }
      }
    }
    const runtime = { db, vintedRelist }

    // Seed the database by reading the report, then find a product that is on Vinted.
    const before = await handleDashboardRequest(
      new Request('https://example.com/dashboard/vinted-relist', { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      runtime
    )
    expect(before?.status).toBe(200)
    const row = (await db.prepare(`SELECT id, vinted_url FROM products WHERE vinted_url LIKE '%vinted.nl/items/%' LIMIT 1`).first()) as {
      id: number
      vinted_url: string
    }
    const itemId = vintedItemId(row.vinted_url)!

    const response = await handleDashboardRequest(
      new Request(`https://example.com/api/admin/vinted-relist/${itemId}`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      runtime
    )
    expect(response?.status).toBe(200)
    const body = (await response!.json()) as { relisted: { itemId: string; url: string; productId: number }; report: VintedRelistReport }
    expect(calls).toEqual([itemId])
    expect(body.relisted).toEqual({ itemId: '9999', url: 'https://www.vinted.nl/items/9999', productId: row.id })
    expect(body.report.login).toBe('helloworldcards')

    const after = (await db.prepare('SELECT vinted_url FROM products WHERE id = ?').bind(row.id).first()) as { vinted_url: string }
    expect(after.vinted_url).toBe('https://www.vinted.nl/items/9999')
  })

  it('reports a relist that needs the user with its own status', async () => {
    const token = await signIn()
    const { VintedRelistError } = await import('../app/services/vinted-relist')
    const vintedRelist: VintedRelistService = {
      async report() {
        throw new VintedRelistError('Vinted is not logged in.', 401)
      },
      async relist() {
        throw new Error('unused')
      }
    }
    const response = await handleDashboardRequest(
      new Request('https://example.com/dashboard/vinted-relist', { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db: createMemoryD1(), vintedRelist }
    )
    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toEqual({ error: 'Vinted is not logged in.' })
  })
})
