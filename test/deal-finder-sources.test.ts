import { describe, expect, it } from 'vitest'
import { marktplaatsPhotoUrl, parseMarktplaatsDetail, parseMarktplaatsOverview } from '~/services/deal-finder/marktplaats'
import { parseVintedDetail, parseVintedHoverTitle, parseVintedOverview, titleFromVintedSlug } from '~/services/deal-finder/vinted'

const MARKTPLAATS_OVERVIEW = `<html><body><script>window.__STATE__ = {"listings":[
  {"itemId":"m2438948556","title":"Pokémon Charmander 168/165 Scarlet & Violet 151 PSA 9",
   "description":"Te koop: een prachtige pokémon charmander kaart (168/165) uit de scarlet & violet 151 (mew) set",
   "vipUrl":"/v/hobby/m2438948556-charmander","priceInfo":{"priceCents":12000,"priceType":"MIN_BID"},
   "sellerInformation":{"sellerName":"juliano"},
   "extendedAttributes":[{"key":"type","value":"Losse kaart"}],
   "pictures":[{"largeUrl":"https://images.marktplaats.com/api/v1/x/aaa?rule=ecg_mp_eps$_83.jpg"}]},
  {"itemId":"m2438970831","title":"Pokémon Jungle Jigglypuff & Meowth PSA Graded","vipUrl":"/v/hobby/m2438970831-lot",
   "priceInfo":{"priceCents":8000,"priceType":"FIXED"},"sellerInformation":{"sellerName":"bram"},
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
      priceType: 'MIN_BID',
      itemType: 'Losse kaart'
    })
    expect(listings[0]?.description).toContain('charmander')
    expect(listings[1]?.itemType).toBe('Meerdere kaarten')
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
      ask: 196,
      listingUrl: 'https://www.vinted.nl/items/9889109421-psa-10-umbreon-vmax-s8b-245',
      priceType: 'FIXED'
    })
  })

  it('falls back to the image alt when the anchor title is clipped', () => {
    // The anchor above is cut mid-word, so only the alt parses into a price.
    expect(parseVintedOverview(VINTED_OVERVIEW)[0]?.ask).toBe(196)
  })

  it('reads the hover string and the slug on their own', () => {
    expect(parseVintedHoverTitle('Espeon ex, Merk: Pokémon, Staat: Goed, 59.99 €, 63.45 €')).toEqual({
      title: 'Espeon ex',
      ask: 59.99
    })
    expect(parseVintedHoverTitle('no price here')).toBeNull()
    expect(titleFromVintedSlug('9863102973-mega-ectoplasma-ex-230193')).toBe('mega ectoplasma ex 230193')
  })
})

describe('parseVintedDetail', () => {
  it('keeps the largest copy of each photo, since thumbnails cannot be read', () => {
    const html = `
      <img src="https://images1.vinted.net/t/06_x/310x430/a.webp?s=1"/>
      <img src="https://images1.vinted.net/t/06_x/800x1200/a.webp?s=2"/>
      <img src="https://images1.vinted.net/t/06_y/800x1200/b.webp?s=3"/>
      <div itemprop="description">Umbreon VMAX PSA 10, s8b 245</div>`
    const detail = parseVintedDetail(html)

    expect(detail.imageUrls).toEqual([
      'https://images1.vinted.net/t/06_x/800x1200/a.webp?s=2',
      'https://images1.vinted.net/t/06_y/800x1200/b.webp?s=3'
    ])
    expect(detail.description).toBe('Umbreon VMAX PSA 10, s8b 245')
  })
})
