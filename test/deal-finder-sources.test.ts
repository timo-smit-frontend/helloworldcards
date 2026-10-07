import { describe, expect, it } from 'vitest'
import {
  isWithinOfferedSince,
  marktplaatsOfferedSince,
  marktplaatsPhotoUrl,
  marktplaatsResultCount,
  marktplaatsSearchPageUrl,
  parseMarktplaatsDetail,
  parseMarktplaatsOverview
} from '~/services/deal-finder/marktplaats'
import {
  isVintedChallenge,
  parseVintedHoverTitle,
  parseVintedOverview,
  titleFromVintedSlug,
  vintedSearchPageUrl
} from '~/services/deal-finder/vinted'

const MARKTPLAATS_OVERVIEW = `<html><body><script>window.__STATE__ = {"listings":[
  {"itemId":"m2438948556","title":"Pokémon Charmander 168/165 Scarlet & Violet 151 PSA 9",
   "description":"Te koop: een prachtige pokémon charmander kaart (168/165) uit de scarlet & violet 151 (mew) set",
   "vipUrl":"/v/hobby/m2438948556-charmander","priceInfo":{"priceCents":12000,"priceType":"MIN_BID"},"date":"Vandaag",
   "sellerInformation":{"sellerName":"juliano"},
   "extendedAttributes":[{"key":"type","value":"Losse kaart"}],
   "pictures":[{"largeUrl":"https://images.marktplaats.com/api/v1/x/aaa?rule=ecg_mp_eps$_83.jpg"}]},
  {"itemId":"m2438970831","title":"Pokémon Jungle Jigglypuff & Meowth PSA Graded","vipUrl":"/v/hobby/m2438970831-lot",
   "priceInfo":{"priceCents":8000,"priceType":"FIXED"},"date":"5 sep 26","sellerInformation":{"sellerName":"bram"},
   "extendedAttributes":[{"key":"type","value":"Meerdere kaarten"}],
   "imageUrls":["//images.marktplaats.com/api/v1/x/bbb?rule=ecg_mp_eps$_82.jpg"]},
  {"itemId":"m2438957000","title":"Bieden op kaarten","vipUrl":"/v/hobby/m-bieden","priceInfo":{"priceCents":0,"priceType":"FAST_BID"}}
]}</script></body></html>`

describe('parseMarktplaatsOverview', () => {
  it('reads the listings, their descriptions and the single/multi card attribute', () => {
    const listings = parseMarktplaatsOverview(MARKTPLAATS_OVERVIEW)

    expect(listings).toHaveLength(2)
    expect(listings[0]).toMatchObject({
      id: 'marktplaats:m2438948556',
      source: 'marktplaats',
      title: 'Pokémon Charmander 168/165 Scarlet & Violet 151 PSA 9',
      ask: 120,
      listingUrl: 'https://www.marktplaats.nl/v/hobby/m2438948556-charmander',
      sellerName: 'juliano',
      sellerId: null,
      priceType: 'MIN_BID',
      itemType: 'Losse kaart'
    })
    expect(listings[0]?.description).toContain('charmander')
    expect(listings[1]?.itemType).toBe('Meerdere kaarten')
  })

  it('reads the day each listing was put up, as Marktplaats prints it', () => {
    expect(parseMarktplaatsOverview(MARKTPLAATS_OVERVIEW).map((listing) => listing.listedOn)).toEqual(['Vandaag', '5 sep 26'])
  })

  it('asks Marktplaats for a photo big enough to read a slab label', () => {
    expect(parseMarktplaatsOverview(MARKTPLAATS_OVERVIEW)[0]?.imageUrls).toEqual([
      'https://images.marktplaats.com/api/v1/x/aaa?rule=ecg_mp_eps$_86.jpg'
    ])
    expect(marktplaatsPhotoUrl('//images.marktplaats.com/x?rule=y$_#.jpg')).toBe('https://images.marktplaats.com/x?rule=y$_86.jpg')
  })
})

describe('parseMarktplaatsDetail', () => {
  const html = `<html><head><meta name="description" content="Te koop: kaart uit de Scarlet &amp;amp; Violet set"/></head>
    <body><script>window.__CONFIG__ = {"listing":{"gallery":{"imageUrls":[
      "//images.marktplaats.com/api/v1/x/one?rule=ecg_mp_eps$_#.jpg",
      "//images.marktplaats.com/api/v1/x/two?rule=ecg_mp_eps$_#.jpg"]}}}</script>
    <div data-testid="description">Volledige omschrijving met <br/>PSA 9 slab.</div></body></html>`

  it('takes every photo from the listing page, not just the first', () => {
    expect(parseMarktplaatsDetail(html).imageUrls).toHaveLength(2)
  })

  it('prefers the rendered description over the clipped meta tag', () => {
    expect(parseMarktplaatsDetail(html).description).toContain('Volledige omschrijving')
  })

  it('falls back to the meta description when the page did not render', () => {
    const bare = '<html><head><meta name="description" content="Korte omschrijving"/></head><body></body></html>'
    expect(parseMarktplaatsDetail(bare).description).toBe('Korte omschrijving')
  })
})

const VINTED_OVERVIEW = `
<div data-testid="product-item-id-9889109421">
  <img data-testid="product-item-id-9889109421--image--img" src="https://images1.vinted.net/t/06_x/310x430/a.webp?s=sig"
    alt="PSA 10 Umbreon Vmax (s8b 245), Merk: Pokémon, Staat: Heel goed, 196.00 €, 206.50 €" />
  <a href="/items/9889109421-psa-10-umbreon-vmax-s8b-245?referrer=catalog"
    data-testid="product-item-id-9889109421--overlay-link"
    title="PSA 10 Umbreon Vmax (s8b 245), Merk: Pokémon, Staat: Heel g"></a>
</div>`

describe('parseVintedOverview', () => {
  it('reads the title and ask from the hover string', () => {
    const listings = parseVintedOverview(VINTED_OVERVIEW)

    expect(listings).toHaveLength(1)
    expect(listings[0]).toMatchObject({
      id: 'vinted:9889109421',
      source: 'vinted',
      title: 'PSA 10 Umbreon Vmax (s8b 245)',
      // The second amount: what Vinted charges, buyer protection included.
      ask: 206.5,
      listingUrl: 'https://www.vinted.nl/items/9889109421-psa-10-umbreon-vmax-s8b-245',
      priceType: 'FIXED'
    })
  })

  it('falls back to the image alt when the anchor title is clipped', () => {
    // The anchor above is cut mid-word, so only the alt parses into a price.
    expect(parseVintedOverview(VINTED_OVERVIEW)[0]?.ask).toBe(206.5)
  })

  it('reads the hover string and the slug on their own', () => {
    // The ask is what the buyer pays; the seller's own figure is what another seller competes with.
    expect(parseVintedHoverTitle('Espeon ex, Merk: Pokémon, Staat: Goed, 59.99 €, 63.45 €')).toEqual({
      title: 'Espeon ex',
      ask: 63.45,
      sellerAsk: 59.99
    })
    expect(parseVintedHoverTitle('no price here')).toBeNull()
  })

  it('takes the condition and prices off a title that has no brand in front of them', () => {
    // Left on, `25.00 €` was read as card number 25 and `.00` became part of the name.
    expect(parseVintedHoverTitle('Gengar PSA Pokemon Slab, Staat: Heel goed, 25.00 €, 26.95 €')).toEqual({
      title: 'Gengar PSA Pokemon Slab',
      ask: 26.95,
      sellerAsk: 25
    })
    expect(titleFromVintedSlug('9863102973-mega-ectoplasma-ex-230193')).toBe('mega ectoplasma ex 230193')
  })
})

describe('isVintedChallenge', () => {
  it('flags the session-refresh interstitial Vinted serves instead of results', () => {
    expect(isVintedChallenge('<html><head><title>Session refresh</title></head><body></body></html>')).toBe(true)
  })

  it("flags Vinted's own Dutch human check", () => {
    expect(
      isVintedChallenge('<html><head><title>Even geduld...</title></head><body><h2>Verifieer dat u een mens bent</h2></body></html>')
    ).toBe(true)
  })

  it('does not flag a page that actually has listings on it', () => {
    expect(isVintedChallenge('<a data-testid="product-item-id-1--overlay-link"></a>')).toBe(false)
  })
})

describe('search page URLs', () => {
  const search = 'https://www.marktplaats.nl/q/pokemon+psa/#offeredSince:Vandaag|PriceCentsTo:20000|sortBy:SORT_INDEX|view:gallery-view'

  it('asks Marktplaats for the filters the browse URL only applies in the browser', () => {
    const asked = new URL(marktplaatsSearchPageUrl(search, 1))

    expect(asked.origin + asked.pathname).toBe('https://www.marktplaats.nl/lrp/api/search')
    expect(asked.searchParams.get('query')).toBe('pokemon psa')
    // The fragment's filters, as parameters the server actually receives.
    expect(asked.searchParams.getAll('attributesByKey[]')).toEqual(['offeredSince:Vandaag'])
    expect(asked.searchParams.getAll('attributeRanges[]')).toEqual(['PriceCents::20000'])
    // `view` only changes how the page looks, so it is not a filter to send.
    expect(asked.searchParams.has('view')).toBe(false)
  })

  it('always asks for the newest first, whatever sort the browse URL carries', () => {
    // `SORT_INDEX` is Marktplaats' relevance ranking, and it silently caps a search at
    // its first hundred results — which for "everything listed today" loses the rest.
    const asked = new URL(marktplaatsSearchPageUrl(search, 1))

    expect(asked.searchParams.get('sortBy')).toBe('SORT_DATE')
    expect(asked.searchParams.get('sortOrder')).toBe('DECREASING')
    expect(asked.searchParams.getAll('attributesByKey[]')).not.toContain('sortBy:SORT_INDEX')
  })

  it('pages Marktplaats by offset, a hundred listings at a time', () => {
    const page = (n: number) => new URL(marktplaatsSearchPageUrl(search, n)).searchParams
    expect(page(1).get('offset')).toBe('0')
    expect(page(1).get('limit')).toBe('100')
    expect(page(4).get('offset')).toBe('300')
  })

  it('pages Vinted through its query parameter', () => {
    expect(vintedSearchPageUrl('https://www.vinted.nl/catalog?search_text=psa&page=1', 2)).toBe(
      'https://www.vinted.nl/catalog?search_text=psa&page=2'
    )
    expect(vintedSearchPageUrl('https://www.vinted.nl/catalog?search_text=psa', 2)).toBe(
      'https://www.vinted.nl/catalog?search_text=psa&page=2'
    )
  })

  it('reads how many listings Marktplaats says the search has', () => {
    expect(marktplaatsResultCount('{"totalResultCount":14700,"maxAllowedPageNumber":167}')).toBe(14700)
    expect(marktplaatsResultCount('{"listings":[]}')).toBeNull()
  })

  describe('the date window Marktplaats echoes but never applies', () => {
    const feed = `{"listings":[],"facets":[{"key":"PriceCents","type":"RangeFacet"},
      {"id":987654321,"key":"offeredSince","label":"Aangeboden sinds","attributeGroup":[
        {"attributeValueKey":"Vandaag","attributeValueLabel":"Vandaag","histogramCount":30,"selected":false},
        {"attributeValueKey":"Gisteren","attributeValueLabel":"Gisteren","histogramCount":184,"selected":false},
        {"attributeValueKey":"Altijd","attributeValueLabel":"Altijd","histogramCount":4899,"selected":true}]}],
      "totalResultCount":4899}`

    it('reads the window off the browse URL', () => {
      expect(marktplaatsOfferedSince(search)).toBe('Vandaag')
      expect(marktplaatsOfferedSince('https://www.marktplaats.nl/q/pokemon+psa/#PriceCentsTo:20000')).toBeNull()
      expect(marktplaatsOfferedSince('https://www.marktplaats.nl/q/pokemon+psa/')).toBeNull()
    })

    it("counts the window's own listings rather than the whole search", () => {
      // `totalResultCount` is the unfiltered search, whatever window was asked for.
      expect(marktplaatsResultCount(feed, 'Vandaag')).toBe(30)
      expect(marktplaatsResultCount(feed, 'Gisteren')).toBe(184)
      expect(marktplaatsResultCount(feed, null)).toBe(4899)
      expect(marktplaatsResultCount('{"listings":[],"totalResultCount":4899}', 'Vandaag')).toBeNull()
    })

    it('keeps only the listings dated inside the window', () => {
      expect(isWithinOfferedSince('Vandaag', 'Vandaag')).toBe(true)
      expect(isWithinOfferedSince('Gisteren', 'Vandaag')).toBe(false)
      expect(isWithinOfferedSince('5 sep 26', 'Vandaag')).toBe(false)
      // A row with no date cannot be shown to be from today.
      expect(isWithinOfferedSince(null, 'Vandaag')).toBe(false)
      expect(isWithinOfferedSince('Gisteren', 'Gisteren')).toBe(true)
      expect(isWithinOfferedSince('Eergisteren', 'Gisteren')).toBe(false)
    })

    it('does not pretend to enforce a window it cannot tell day by day', () => {
      expect(isWithinOfferedSince('5 sep 26', 'Een week')).toBe(true)
      expect(isWithinOfferedSince('5 sep 26', null)).toBe(true)
      expect(isWithinOfferedSince(null, null)).toBe(true)
    })
  })
})

describe('text the marketplaces escape', () => {
  it('reads an apostrophe Vinted escaped twice, rather than taking `x27` for a card number', () => {
    const title = 'Pikachu McDonald&amp;#x27;s Promo #020 (2025 Japanese) (PSA 10)'
    const html = `<div>
      <img data-testid="product-item-id-10159708104--image--img" src="https://images1.vinted.net/t/a/310x430/b.webp?s=1"
        alt="${title}, Merk: Pokémon, Staat: Zeer goed, 129.00 €, 136.15 €" />
      <a href="/items/10159708104-pikachu" data-testid="product-item-id-10159708104--overlay-link"
        title="${title}, Merk: Pokémon, Staat: Zeer goed, 129.00 €, 136.15 €"></a></div>`

    expect(parseVintedOverview(html)[0]?.title).toBe("Pikachu McDonald's Promo #020 (2025 Japanese) (PSA 10)")
  })

  it('reads numeric entities in a Marktplaats description', () => {
    const detail = parseMarktplaatsDetail(
      '<div data-testid="description">Zeldzame PSA 9 gegradeerde Team Rocket&#x27;s Mimikyu &#8211; nette slab</div>'
    )

    expect(detail.description).toBe("Zeldzame PSA 9 gegradeerde Team Rocket's Mimikyu – nette slab")
  })
})
