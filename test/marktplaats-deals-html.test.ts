import { describe, expect, it } from 'vitest'
import { parseMarktplaatsOverview } from '~/services/marktplaats-deals/html'

const overviewFixture = `
<html><body>
<script>
window.__STATE__ = {"listings":[
  {"title":"Vaporeon VMAX PSA 9 Mint Pokémon Kaart","vipUrl":"/v/hobby/m2437952974-vaporeon","priceInfo":{"priceCents":11000,"priceType":"MIN_BID"},"sellerInformation":{"sellerName":"TCG"},"pictures":[{"largeUrl":"https://images.marktplaats.com/vaporeon.jpg"}]},
  {"title":"Pokémon - 3 Graded card - PSA 10 - Various sets","vipUrl":"/v/hobby/a1530392314-lot","priceInfo":{"priceCents":4200,"priceType":"FIXED"},"sellerInformation":{"sellerName":"Catawiki"}},
  {"title":"Pokemon Chansey 015/113 PSA 9 Mint - 2023 CLV EN","vipUrl":"/v/hobby/m2437912490-chansey","priceInfo":{"priceCents":2250,"priceType":"MIN_BID"},"sellerInformation":{"sellerName":"cupone"},"imageUrls":["//images.marktplaats.com/chansey$_82.jpg"]},
  {"title":"Pokemon Kaarten McDonalds","vipUrl":"/v/hobby/m-bieden","priceInfo":{"priceCents":0,"priceType":"FAST_BID"},"sellerInformation":{"sellerName":"Bram"}}
]}
</script>
</body></html>
`

describe('parseMarktplaatsOverview', () => {
  it('reads embedded listing JSON from the overview page', () => {
    const listings = parseMarktplaatsOverview(overviewFixture)

    expect(listings).toHaveLength(3)
    expect(listings[0]).toMatchObject({
      title: 'Vaporeon VMAX PSA 9 Mint Pokémon Kaart',
      ask: 110,
      marktplaatsUrl: 'https://www.marktplaats.nl/v/hobby/m2437952974-vaporeon',
      sellerName: 'TCG',
      priceType: 'MIN_BID',
      imageUrl: 'https://images.marktplaats.com/vaporeon.jpg'
    })
    expect(listings[2]?.imageUrl).toBe('https://images.marktplaats.com/chansey$_85.jpg')
  })
})
