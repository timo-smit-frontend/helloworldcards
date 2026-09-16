import { describe, expect, it } from 'vitest'
import { formatAge } from '../app/components/dashboard/VintedRelist'
import type { InventoryProduct } from '../app/database/products'
import {
  buildRelistReport,
  catalogPathTo,
  cooldownRemainingMs,
  dutchRelativeDays,
  emptyRelistState,
  listingsWithoutAge,
  normalizeRelistState,
  originalPhotos,
  pageLooksRateLimited,
  parseVintedSnapshot,
  parseVintedUploadedText,
  parseWardrobeItems,
  listingTitleNamesProduct,
  replacementListing,
  settleMissingByHand,
  settlePendingByHand,
  vintedFlightData,
  vintedFlightRows,
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

/** The model's row, with any rows it refers to in front of it, as React writes them. */
function editFlight(model: object, ...outlined: string[]): string {
  const head = 'a1:["$","$La2",null,{"config":{"numberOfImagesPerItem":20},"itemEditModel":'
  const tail = ',"parcelModel":"$undefined","photos":' + JSON.stringify(EDIT_PHOTOS) + ',"children":"$Lc0"}]\n'
  return outlined.join('') + head + JSON.stringify(model) + tail
}

/** A string of 1 KB or more gets a row of its own: its id, then its length in UTF-8 bytes (hex), then the text. */
function textRow(id: string, text: string): string {
  return `${id}:T${new TextEncoder().encode(text).length.toString(16)},${text}`
}

/** Split across pushes at arbitrary points, the way a long page arrives (never inside a character). */
function pushes(flight: string, size: number): string[] {
  return flight.match(new RegExp(`[\\s\\S]{1,${size}}`, 'gu')) ?? []
}

function editPage(): string {
  return rscPage(...pushes(editFlight(EDIT_MODEL), 120))
}

/** Long enough to be outlined, with characters of every UTF-8 width and the quotes a text row does not escape. */
const LONG_DESCRIPTION =
  'Mooie Zorua Art Rare uit de Japanse Pokémon White Flare set van 2025. "Gem Mint" — lage pop.\n\n' +
  'Details:\n• Grade: BGS 9.5 Gem Mint\n• Centering: 9.5\n\n📦 Verzenden of ophalen mogelijk.\n'.repeat(14)

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

  it('follows a long description to the text row React wrote it as', () => {
    expect(LONG_DESCRIPTION.length).toBeGreaterThanOrEqual(1024)
    const flight = editFlight({ ...EDIT_MODEL, description: '$c0' }, textRow('c0', LONG_DESCRIPTION))
    const snapshot = parseVintedSnapshot(rscPage(...pushes(flight, 333)))
    expect(snapshot?.description).toBe(LONG_DESCRIPTION)
    expect(snapshot?.title).toBe(EDIT_MODEL.title)
    expect(snapshot?.photos).toHaveLength(2)
  })

  it('reads a brand the page keeps in a row of its own', () => {
    const flight = editFlight({ ...EDIT_MODEL, brand: '$c1' }, 'c1:{"id":191646,"title":"Pokémon","isHvf":false}\n')
    expect(parseVintedSnapshot(rscPage(flight))).toMatchObject({ brandId: 191646, brandTitle: 'Pokémon' })
  })

  it('refuses a listing whose description points at a row that is not on the page', () => {
    // Copying the reference itself is what put "$c0" in a listing's description once.
    const page = rscPage(editFlight({ ...EDIT_MODEL, description: '$c0' }))
    expect(() => parseVintedSnapshot(page)).toThrow(/"\$c0", which is not on the page/)
    expect(() => parseVintedSnapshot(rscPage(editFlight({ ...EDIT_MODEL, description: '$L5' })))).toThrow(/"\$L5"/)
  })

  it('splits the payload into rows, a text row by its byte length', () => {
    const text = 'héllo\n"wörld" 📦'
    const rows = vintedFlightRows('1:I["x"]\n' + textRow('c0', text) + '2:["$","div"]\n' + '3:"$$dollar"')
    expect(rows.get('1')).toEqual({ kind: 'line', value: 'I["x"]' })
    expect(rows.get('c0')).toEqual({ kind: 'text', value: text })
    expect(rows.get('2')).toEqual({ kind: 'line', value: '["$","div"]' })
    expect(rows.get('3')).toEqual({ kind: 'line', value: '"$$dollar"' })
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

  it('shows hours instead of days for a listing from today', () => {
    const now = new Date('2026-09-15T15:30:00Z')
    const age = (ageDays: number | null, listedAt: string | null, ageText: string | null = null) =>
      formatAge({ ageDays, ageText, listedAt }, now)
    expect(age(0, '2026-09-15T15:29:30Z')).toBe('0 min')
    expect(age(0, '2026-09-15T15:05:00Z')).toBe('25 min')
    expect(age(0, '2026-09-15T14:20:00Z')).toBe('1 hour')
    expect(age(0, '2026-09-15T09:00:00Z')).toBe('6 hours')
    expect(age(0, null)).toBe('Today')
    expect(age(1, '2026-09-14T09:00:00Z')).toBe('1 day')
    expect(age(12, '2026-09-03T09:00:00Z')).toBe('12 days')
    expect(age(null, null, 'een week geleden')).toBe('een week geleden')
    expect(age(null, null)).toBe('Age unknown')
  })
})

describe('originalPhotos', () => {
  it('names the branded ad photo and the slab photos of a card that came with the seed', () => {
    expect(originalPhotos({ images: ['/media/148651617_front.jpg', '/media/148651617_back.jpg'] })).toEqual({
      ad: 'public/ads/148651617.jpeg',
      media: ['148651617_front.jpg', '148651617_back.jpg']
    })
  })

  it('reads the cert off a photo uploaded through the admin, whose key carries the upload id', () => {
    expect(originalPhotos({ images: ['/media/mtpx3uh1-155373625-front.jpg', '/media/mtpx3uk6-155373625-back.jpg'] })).toEqual({
      ad: 'public/ads/155373625.jpeg',
      media: ['mtpx3uh1-155373625-front.jpg', 'mtpx3uk6-155373625-back.jpg']
    })
  })

  it('leaves the ad photo out when the cert cannot be read off the front photo', () => {
    expect(originalPhotos({ images: ['/media/charizard.jpg'] })).toEqual({ ad: null, media: ['charizard.jpg'] })
  })

  it('has nothing for a product without site images', () => {
    expect(originalPhotos({ images: [] })).toBeNull()
    expect(originalPhotos({ images: ['https://elsewhere.example/x.jpg'] })).toBeNull()
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

  it('runs listings from the same day from the earliest to the latest bump', () => {
    const now = new Date('2026-09-12T12:00:00Z')
    const state = emptyRelistState()
    state.records['1'] = { itemId: '1', previousItemId: '0', productId: 1, listedAt: '2026-09-12T11:30:00Z' }
    state.records['2'] = { itemId: '2', previousItemId: '0', productId: 2, listedAt: '2026-09-12T08:00:00Z' }
    state.records['3'] = { itemId: '3', previousItemId: '0', productId: 3, listedAt: '2026-09-12T10:00:00Z' }
    state.records['4'] = { itemId: '4', previousItemId: '0', productId: 4, listedAt: '2026-09-10T18:00:00Z' }
    const report = buildRelistReport({
      wardrobe: parseWardrobeItems({
        items: [
          { id: 1, title: 'A late', price: '1.00' },
          { id: 2, title: 'C early', price: '1.00' },
          { id: 3, title: 'B midday', price: '1.00' },
          { id: 4, title: 'D older', price: '1.00' }
        ]
      }),
      products: [],
      state,
      login: 'helloworldcards',
      now
    })
    expect(report.rows.map((row) => row.title)).toEqual(['D older', 'C early', 'B midday', 'A late'])
  })

  it('leaves a reserved card out: sold, so neither a row to relist nor a listing gone missing', () => {
    const now = new Date('2026-09-12T12:00:00Z')
    const report = buildRelistReport({
      wardrobe,
      products: [
        product({ id: 1, title: 'Mewtwo', vintedUrl: 'https://www.vinted.nl/items/111-mewtwo' }),
        // Sold on Marktplaats and marked reserved on Vinted, so the wardrobe still has it.
        product({ id: 2, title: 'Dragonite', vintedUrl: 'https://www.vinted.nl/items/222', reserved: true }),
        // Sold on Vinted itself, which took the listing down; nothing to chase.
        product({ id: 3, title: 'Charizard', vintedUrl: 'https://www.vinted.nl/items/999', reserved: true })
      ],
      state: emptyRelistState(),
      login: 'helloworldcards',
      now
    })

    expect(report.rows.map((row) => row.itemId).sort()).toEqual(['111', '333', '444'])
    expect(report.missing).toEqual([])
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

  it('joins a relisted listing to its product while the product still names the old one', () => {
    const state = emptyRelistState()
    state.records['555'] = { itemId: '555', previousItemId: '444', productId: 3, listedAt: '2026-09-13T08:40:00Z' }
    const report = buildRelistReport({
      wardrobe: parseWardrobeItems({ items: [{ id: 555, title: 'Fresh copy', price: '10.00' }] }),
      products: [product({ id: 3, title: 'Gone', vintedUrl: 'https://www.vinted.nl/items/444' })],
      state,
      login: null
    })
    expect(report.rows[0].product).toEqual({ id: 3, title: 'Gone', slug: 'p-3' })
    expect(report.missing).toEqual([])
  })

  function pendingEntry(title: string, productId: number | null) {
    return {
      snapshot: {
        itemId: '444',
        title,
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
      productId,
      photoFiles: [],
      deletedAt: '2026-09-12T10:00:00Z',
      error: 'Vinted did not publish the listing.'
    }
  }

  it('lists a deleted-but-not-reuploaded listing as pending, not as missing', () => {
    const state = emptyRelistState()
    state.pending['444'] = pendingEntry('Gone card', 3)
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
    expect(report.byHand).toEqual([])
  })

  it('takes a newer listing with the pending title as the relist done by hand', () => {
    const now = new Date('2026-09-13T12:00:00Z')
    const state = emptyRelistState()
    state.pending['9878798267'] = pendingEntry('Zorua 140/086 AR - BGS 9.5 - White Flare Japanese', 5)
    const fresh = parseWardrobeItems({
      items: [
        // An older listing with the same title is not the one, nor is a closed one.
        { id: 9878000000, title: 'Zorua 140/086 AR - BGS 9.5 - White Flare Japanese', price: '65.00' },
        { id: 9982400000, title: 'Zorua 140/086 AR - BGS 9.5 - White Flare Japanese', price: '65.00', is_closed: true },
        {
          id: 9982493582,
          title: 'Zorua 140/086 AR  - BGS 9.5 - White Flare Japanese',
          price: '65.00',
          photos: [{ url: 'https://img/z.jpg', high_resolution: { timestamp: Date.UTC(2026, 8, 13, 8, 40) / 1000 } }]
        }
      ]
    })

    expect(settlePendingByHand(state, fresh, now)).toEqual([
      {
        itemId: '9982493582',
        previousItemId: '9878798267',
        productId: 5,
        url: 'https://www.vinted.nl/items/9982493582'
      }
    ])
    expect(state.pending).toEqual({})
    expect(state.records['9982493582']).toEqual({
      itemId: '9982493582',
      previousItemId: '9878798267',
      productId: 5,
      listedAt: '2026-09-13T08:40:00.000Z'
    })
  })

  it('keeps a relist pending while nothing newer with its title is up', () => {
    const state = emptyRelistState()
    state.pending['444'] = pendingEntry('Gone card', 3)
    const older = parseWardrobeItems({ items: [{ id: 443, title: 'Gone card', price: '10.00' }] })
    expect(settlePendingByHand(state, older)).toEqual([])
    expect(Object.keys(state.pending)).toEqual(['444'])
  })

  it('does not take a listing whose delete never finished for its own replacement', () => {
    const state = emptyRelistState()
    state.pending['444'] = { ...pendingEntry('Gone card', 3), deletedAt: '', error: 'Vinted did not open a confirmation.' }
    const stillUp = parseWardrobeItems({ items: [{ id: 444, title: 'Gone card', price: '10.00' }] })
    expect(settlePendingByHand(state, stillUp)).toEqual([])
    const report = buildRelistReport({
      wardrobe: stillUp,
      products: [product({ id: 3, title: 'Gone', vintedUrl: 'https://www.vinted.nl/items/444' })],
      state,
      login: 'x'
    })
    expect(report.pending.map((entry) => entry.itemId)).toEqual(['444'])
    expect(report.missing).toEqual([])
  })
})

describe('replacementListing', () => {
  const title = 'Lugia V Full Art 185/195 - PSA 9 - Silver Tempest'

  it("finds the listing that went up in a deleted one's place, straight after the upload", () => {
    // What the wardrobe shows a moment after publishing: the old listing gone, the copy up.
    const wardrobe = parseWardrobeItems({
      items: [
        { id: 10016398906, title, price: '89.99' },
        { id: 10014396668, title: 'Arceus V Full Art 165/172 - PSA 9 - Brilliant Stars', price: '59.99' }
      ]
    })
    expect(replacementListing(wardrobe, '10014364490', title)?.id).toBe(10016398906)
  })

  it('takes the newest of several, and never an older, closed or differently titled one', () => {
    const wardrobe = parseWardrobeItems({
      items: [
        { id: 10014000000, title, price: '89.99' },
        { id: 10016400000, title, price: '89.99', is_closed: true },
        { id: 10016398906, title: '  lugia v full art 185/195 - psa 9 -  silver tempest ', price: '89.99' },
        { id: 10016500000, title: 'Lugia V Full Art 185/195 - PSA 10 - Silver Tempest', price: '189.99' }
      ]
    })
    expect(replacementListing(wardrobe, '10014364490', title)?.id).toBe(10016398906)
    expect(replacementListing(wardrobe, '10016398906', title)).toBeNull()
    expect(replacementListing([], '10014364490', title)).toBeNull()
  })
})

describe('settleMissingByHand', () => {
  const now = new Date('2026-09-15T10:00:00Z')
  const pikachu = product({ id: 14, title: 'Pikachu', grader: 'psa', grade: 9, vintedUrl: 'https://www.vinted.nl/items/10004260813' })
  const mewtwo = product({ id: 1, title: 'Mewtwo', grader: 'psa', grade: 9, vintedUrl: 'https://www.vinted.nl/items/10003896597' })
  const mewtwoGx = product({ id: 11, title: 'Mewtwo GX', grader: 'psa', grade: 10, vintedUrl: 'https://www.vinted.nl/items/9982827132' })

  it('knows which card a listing title names', () => {
    expect(listingTitleNamesProduct('Pikachu 160/159 - PSA 9 - Crown Zenith', pikachu)).toBe(true)
    expect(listingTitleNamesProduct('Pikachu 160/159 – PSA 9 – Crown Zenith', pikachu)).toBe(true)
    expect(listingTitleNamesProduct('Pikachu 160/159 - PSA 10 - Crown Zenith', pikachu)).toBe(false)
    expect(listingTitleNamesProduct('Mewtwo GX 39/73 - PSA 10 - Shining Legends', mewtwo)).toBe(false)
    expect(listingTitleNamesProduct('Mewtwo GX 39/73 - PSA 10 - Shining Legends', mewtwoGx)).toBe(true)
    expect(listingTitleNamesProduct('Mewtwo 51/108 - PSA 9 - Evolutions', mewtwo)).toBe(true)
    expect(listingTitleNamesProduct('Pikachus 160/159 - PSA 9 - Crown Zenith', pikachu)).toBe(false)
  })

  it('points a card whose listing is gone at the unclaimed newer listing with its title', () => {
    const state = emptyRelistState()
    state.records['10004260813'] = { itemId: '10004260813', previousItemId: '9990559139', productId: 14, listedAt: '2026-09-14T16:48:39Z' }
    const wardrobe = parseWardrobeItems({
      items: [
        { id: 10003896597, title: 'Mewtwo 51/108 - PSA 9 - Evolutions', price: '89.99' },
        {
          id: 10005185939,
          title: 'Pikachu 160/159 - PSA 9 - Crown Zenith',
          price: '100.00',
          photos: [{ url: 'https://img/p.jpg', high_resolution: { timestamp: Date.UTC(2026, 8, 14, 18, 53) / 1000 } }]
        }
      ]
    })
    expect(settleMissingByHand(state, wardrobe, [pikachu, mewtwo], now)).toEqual([
      { itemId: '10005185939', previousItemId: '10004260813', productId: 14, url: 'https://www.vinted.nl/items/10005185939' }
    ])
    expect(state.records).toEqual({
      '10005185939': { itemId: '10005185939', previousItemId: '10004260813', productId: 14, listedAt: '2026-09-14T18:53:00.000Z' }
    })
    // The report then shows the listing as the card's, and the card is no longer missing.
    const report = buildRelistReport({ wardrobe, products: [pikachu, mewtwo], state, login: 'x', now })
    expect(report.rows.find((row) => row.itemId === '10005185939')?.product?.id).toBe(14)
    expect(report.missing).toEqual([])
  })

  it('leaves a card alone while no listing, or more than one, could be its relist', () => {
    const wardrobe = parseWardrobeItems({
      items: [
        // Older than the one that vanished, so not a relist of it.
        { id: 10004000000, title: 'Pikachu 160/159 - PSA 9 - Crown Zenith', price: '100.00' },
        // Two that could each be it.
        { id: 10005100000, title: 'Mewtwo 51/108 - PSA 9 - Evolutions', price: '89.99' },
        { id: 10005200000, title: 'Mewtwo 51/108 - PSA 9 - Evolutions', price: '89.99' },
        // Claimed by another product already, and a draft.
        { id: 10005300000, title: 'Mewtwo GX 39/73 - PSA 10 - Shining Legends', price: '120.00', is_draft: true }
      ]
    })
    const state = emptyRelistState()
    expect(settleMissingByHand(state, wardrobe, [pikachu, mewtwo, mewtwoGx], now)).toEqual([])
    expect(state.records).toEqual({})
  })

  it('does not touch a sold or reserved card, nor a relist that is still pending here', () => {
    const wardrobe = parseWardrobeItems({ items: [{ id: 10005185939, title: 'Pikachu 160/159 - PSA 9 - Crown Zenith', price: '100.00' }] })
    const state = emptyRelistState()
    expect(settleMissingByHand(state, wardrobe, [{ ...pikachu, reserved: true }], now)).toEqual([])
    expect(settleMissingByHand(state, wardrobe, [{ ...pikachu, sold: true }], now)).toEqual([])
    state.pending['10004260813'] = {
      snapshot: {
        itemId: '10004260813',
        title: 'Pikachu 160/159 - PSA 9 - Crown Zenith',
        description: '',
        catalogId: 1,
        brandId: null,
        brandTitle: null,
        conditionId: null,
        packageSizeId: null,
        price: 100,
        isUnisex: false,
        colorIds: [],
        photos: []
      },
      productId: 14,
      photoFiles: [],
      deletedAt: '2026-09-15T09:00:00Z',
      error: 'Vinted did not publish the listing.'
    }
    expect(settleMissingByHand(state, wardrobe, [pikachu], now)).toEqual([])
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
  return { rows: [], pending: [], missing: [], byHand: [], login: 'helloworldcards', fetchedAt: '2026-09-12T12:00:00Z' }
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

  it('refuses to relist a reserved card, whatever tab the button was pressed in', async () => {
    const token = await signIn()
    const db = createMemoryD1()
    const calls: string[] = []
    const vintedRelist: VintedRelistService = {
      async report() {
        return emptyReport()
      },
      async relist(itemId) {
        calls.push(itemId)
        return { itemId: '9999', url: 'https://www.vinted.nl/items/9999', productId: null }
      }
    }
    const runtime = { db, vintedRelist }
    // Reading the report seeds the database; the seed has reserved cards in it.
    await handleDashboardRequest(
      new Request('https://example.com/dashboard/vinted-relist', { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      runtime
    )
    const row = (await db.prepare('SELECT title, vinted_url FROM products WHERE reserved = 1').first()) as {
      title: string
      vinted_url: string
    }

    const response = await handleDashboardRequest(
      new Request(`https://example.com/api/admin/vinted-relist/${vintedItemId(row.vinted_url)}`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      }),
      env,
      runtime
    )
    expect(response?.status).toBe(409)
    await expect(response?.json()).resolves.toEqual({ error: `${row.title} is reserved. A sold card is not relisted.` })
    expect(calls).toEqual([])
  })

  it('passes a new price from the body to the service and rejects a bad one', async () => {
    const token = await signIn()
    const db = createMemoryD1()
    const calls: Array<{ itemId: string; price?: number }> = []
    const vintedRelist: VintedRelistService = {
      async report() {
        return emptyReport()
      },
      async relist(itemId, _products, options) {
        calls.push({ itemId, price: options?.price })
        return { itemId: '9999', url: 'https://www.vinted.nl/items/9999', productId: null }
      }
    }
    const runtime = { db, vintedRelist }
    const post = (body?: string) =>
      handleDashboardRequest(
        new Request('https://example.com/api/admin/vinted-relist/9878696344', {
          method: 'POST',
          headers: { Cookie: `${SESSION_COOKIE}=${token}`, 'Content-Type': 'application/json' },
          body
        }),
        env,
        runtime
      )

    expect((await post(JSON.stringify({ price: 59.99 })))?.status).toBe(200)
    expect((await post())?.status).toBe(200)
    expect(calls).toEqual([
      { itemId: '9878696344', price: 59.99 },
      { itemId: '9878696344', price: undefined }
    ])
    expect((await post(JSON.stringify({ price: '60' })))?.status).toBe(400)
    expect((await post(JSON.stringify({ price: -1 })))?.status).toBe(400)
    expect(calls).toHaveLength(2)
  })

  it('moves the product to a listing the seller relisted by hand', async () => {
    const token = await signIn()
    const db = createMemoryD1()
    let byHand: VintedRelistReport['byHand'] = []
    const vintedRelist: VintedRelistService = {
      async report(products) {
        const owner = products.find((candidate) => candidate.vintedUrl?.includes('/items/'))!
        const previousItemId = vintedItemId(owner.vintedUrl!)!
        byHand = [{ itemId: '8888', previousItemId, productId: owner.id, url: 'https://www.vinted.nl/items/8888' }]
        return { ...emptyReport(), byHand }
      },
      async relist() {
        throw new Error('unused')
      }
    }
    const response = await handleDashboardRequest(
      new Request('https://example.com/dashboard/vinted-relist', { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db, vintedRelist }
    )
    expect(response?.status).toBe(200)
    const after = (await db.prepare('SELECT vinted_url FROM products WHERE id = ?').bind(byHand[0].productId).first()) as {
      vinted_url: string
    }
    expect(after.vinted_url).toBe('https://www.vinted.nl/items/8888')
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
