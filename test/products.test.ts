import { describe, expect, it } from 'vitest'
import { isShopListed, productBuyLink, toPublicProduct } from '~/database/products'
import { listInventory, listShopProducts } from '../worker/cms/db'
import { ensureSeeded } from '../worker/cms/seed'
import { createMemoryD1 } from './helpers/memory-d1'

async function seededShop() {
  const db = createMemoryD1()
  await ensureSeeded(db)
  const inventory = await listInventory(db)
  const products = await listShopProducts(db)
  return { db, inventory, products }
}

describe('product inventory', () => {
  it('keeps only the shop cards, titled as printed on the slab', async () => {
    const { products } = await seededShop()
    expect(products.map((product) => [product.id, product.title, product.subtitle, product.slug])).toEqual([
      [1, 'Mewtwo', '2016 Evolutions - #51', 'mewtwo-2016-evolutions-51'],
      [2, 'Lugia V', '2022 Silver Tempest - #185', 'lugia-v-2022-silver-tempest-185'],
      [4, 'Ekans', '2000 Team Rocket - #56', 'ekans-2000-team-rocket-56'],
      [5, 'Zorua AR', '2025 White Flare Japanese - #140', 'zorua-ar-2025-white-flare-japanese-140'],
      [6, 'Arceus V', '2022 Brilliant Stars - #165', 'arceus-v-2022-brilliant-stars-165'],
      [7, 'Mega Latias ex', '2025 Mega Evolution - #181', 'mega-latias-ex-2025-mega-evolution-181'],
      [8, 'Zekrom', '2022 Brilliant Stars - #TG05', 'zekrom-2022-brilliant-stars-tg05'],
      [9, 'Poke Kid', '2020 Shiny Star V Japanese - #197', 'poke-kid-2020-shiny-star-v-japanese-197'],
      [11, 'Mewtwo GX', '2017 Shining Legends - #39', 'mewtwo-gx-2017-shining-legends-39'],
      [12, 'Dragonite V', '2022 Pokemon GO - #049', 'dragonite-v-2022-pokemon-go-049'],
      [15, 'Psyduck', '2000 Team Rocket - #65', 'psyduck-2000-team-rocket-65'],
      [16, 'Beautifly', '2026 Ascended Heroes - #219', 'beautifly-2026-ascended-heroes-219'],
      [17, 'Giratina V', '2022 Lost Origin - #185', 'giratina-v-2022-lost-origin-185'],
      [19, 'Vaporeon', '2022 Brilliant Stars - #TG02', 'vaporeon-2022-brilliant-stars-tg02'],
      [20, 'Pachirisu', '2023 Scarlet & Violet - #208', 'pachirisu-2023-scarlet-violet-208'],
      [21, 'Marill', '2026 Ascended Heroes - #232', 'marill-2026-ascended-heroes-232'],
      [22, 'Dedenne', '2026 Perfect Order - #093', 'dedenne-2026-perfect-order-093']
    ])
  })

  it('keeps the sold Pikachu out of the shop but in inventory at its sale price', async () => {
    const { inventory, products } = await seededShop()
    const record = inventory.find((item) => item.id === 14)

    // Sold on Marktplaats for €100 on 17 September 2026, money in: sold, not reserved.
    expect(record?.sold).toBe(true)
    expect(record?.reserved).toBeUndefined()
    expect(record?.soldAt).toBe('2026-09-17')
    expect(record?.price).toBe('€100')
    expect(products.find((item) => item.id === 14)).toBeUndefined()
  })

  it('keeps purchase cost and sale status off the public product records', async () => {
    const { products } = await seededShop()
    expect(
      products.every(
        (product) =>
          !('cost' in product) &&
          !('sold' in product) &&
          !('soldAt' in product) &&
          !('acquiredAt' in product) &&
          !('concept' in product) &&
          !('grade' in product) &&
          !('cardmarketUrl' in product) &&
          !('reverseHolo' in product) &&
          !('firstEdition' in product)
      )
    ).toBe(true)
  })

  it('keeps sold cards in inventory and off the shop', async () => {
    expect(isShopListed({})).toBe(true)
    expect(isShopListed({ sold: false })).toBe(true)
    expect(isShopListed({ sold: true })).toBe(false)
    // Reserved is sold-but-not-settled: the card stays on the shop, shown as reserved.
    expect(isShopListed({ reserved: true })).toBe(true)

    const { inventory, products } = await seededShop()
    const sold = inventory.filter((item) => item.sold)
    const shopIds = new Set(products.map((product) => product.id))

    for (const item of sold) {
      expect(shopIds.has(item.id)).toBe(false)
    }
  })

  it('has no concept inventory left without listing URLs', async () => {
    const { inventory } = await seededShop()
    const liveIds = [1, 2, 3, 4, 5, 6, 7, 8, 9]

    for (const id of liveIds) {
      const item = inventory.find((product) => product.id === id)
      expect(item?.concept).toBeUndefined()
      expect(item?.marktplaatsUrl).toMatch(/^https:\/\/www\.marktplaats\.nl\//)
    }

    expect(inventory.every((item) => !(item.concept && item.marktplaatsUrl))).toBe(true)
  })

  it('tracks what was paid for stock on the inventory records', async () => {
    const { inventory } = await seededShop()
    const priced = inventory.filter((product) => product.cost != null)

    expect(priced.length).toBeGreaterThan(0)
    expect(priced.every((product) => product.cost != null && product.cost >= 0)).toBe(true)
  })

  it('lists the Evolutions Mewtwo at the current shop price', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'mewtwo-2016-evolutions-51')

    expect(product?.title).toBe('Mewtwo')
    expect(product?.description).toContain('reverse holo')
    expect(product?.description).toContain('XY Evolutions')
    expect(product?.description).toContain('51/108')
    expect(product?.description).toContain('148651617')
    expect(product?.description).not.toContain('Email us')
    expect(product?.description).not.toContain('Fugitive Ink')
    expect(product?.description).not.toContain('graded higher')
    expect(product?.price).toBe('€75')
    expect(product?.language).toBe('english')
    expect(product?.grader).toBe('psa')
    expect(product?.year).toBe(2016)
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436737465')
    const record = inventory.find((item) => item.id === 1)
    expect(record?.cardmarketUrl).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/Evolutions/Mewtwo-V1-EVO51')
    expect(record?.reverseHolo).toBe(true)
    expect(record?.firstEdition).toBeUndefined()
  })

  it('lists the Silver Tempest Lugia V with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'lugia-v-2022-silver-tempest-185')

    expect(product?.title).toBe('Lugia V')
    expect(product?.description).toContain('Full Art')
    expect(product?.description).toContain('Silver Tempest')
    expect(product?.description).toContain('185/195')
    expect(product?.description).toContain('76719295')
    expect(product?.price).toBe('€40')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436737892')
    expect(product?.images).toEqual(['/media/76719295_front.jpg', '/media/76719295_back.jpg'])
    expect(inventory.find((item) => item.id === 2)?.cost).toBe(30)
    expect(inventory.find((item) => item.id === 2)?.reserved).toBe(true)
    expect(inventory.find((item) => item.id === 2)?.soldAt).toBe('2026-09-16')
  })

  it('keeps the reserved Lugia V in the shop, with its ads still on record', async () => {
    const { inventory, products } = await seededShop()
    const record = inventory.find((item) => item.id === 2)
    const product = products.find((item) => item.id === 2)

    // Bought on Vinted, on its way, money not in yet: reserved, not sold.
    expect(record?.reserved).toBe(true)
    expect(record?.sold).toBeUndefined()
    expect(record?.soldAt).toBe('2026-09-16')
    expect(record?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436737892')
    expect(record?.vintedUrl).toBe('https://www.vinted.nl/items/10016398906')
    expect(product?.reserved).toBe(true)
    expect(productBuyLink(product!)).toEqual({ title: 'This card is reserved' })
  })

  it('keeps the sold Generations Charizard out of the shop but in inventory at its sale price', async () => {
    const { inventory, products } = await seededShop()
    const record = inventory.find((item) => item.id === 3)

    // Sold on Vinted for €115 on 14 September 2026, money in: sold, not reserved, ads gone.
    expect(record?.title).toBe('Charizard')
    expect(record?.sold).toBe(true)
    expect(record?.reserved).toBeUndefined()
    expect(record?.soldAt).toBe('2026-09-14')
    expect(record?.price).toBe('€115')
    expect(record?.cost).toBe(75)
    expect(record?.marktplaatsUrl).toBeUndefined()
    expect(record?.vintedUrl).toBeUndefined()
    expect(products.find((item) => item.id === 3)).toBeUndefined()
  })

  it('lists the 1st Edition Rocket Ekans with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'ekans-2000-team-rocket-56')
    const record = inventory.find((item) => item.id === 4)

    expect(product?.title).toBe('Ekans')
    expect(product?.price).toBe('€60')
    expect(record?.cost).toBe(25)
    expect(record?.firstEdition).toBe(true)
  })

  it('lists the White Flare Japanese Zorua AR with Beckett slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'zorua-ar-2025-white-flare-japanese-140')
    const record = inventory.find((item) => item.id === 5)

    expect(product?.title).toBe('Zorua AR')
    expect(product?.language).toBe('japanese')
    expect(product?.grader).toBe('beckett')
    expect(product?.price).toBe('€60')
    expect(record?.cost).toBe(40)
    expect(record?.acquiredAt).toBe('2026-08-30')
  })

  it('lists the Brilliant Stars Arceus V with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'arceus-v-2022-brilliant-stars-165')

    expect(product?.title).toBe('Arceus V')
    expect(product?.price).toBe('€45')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2438244195')
    expect(inventory.find((item) => item.id === 6)?.cost).toBe(28)
    expect(inventory.find((item) => item.id === 6)?.concept).toBeUndefined()
  })

  it('lists the Mega Evolution Mega Latias ex SIR with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'mega-latias-ex-2025-mega-evolution-181')

    expect(product?.title).toBe('Mega Latias ex')
    expect(product?.price).toBe('€105')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2438256231')
    expect(inventory.find((item) => item.id === 7)?.cost).toBe(72)
    expect(inventory.find((item) => item.id === 7)?.concept).toBeUndefined()
  })

  it('lists the Brilliant Stars Trainer Gallery Zekrom with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'zekrom-2022-brilliant-stars-tg05')

    expect(product?.title).toBe('Zekrom')
    expect(product?.price).toBe('€55')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2438244101')
    expect(inventory.find((item) => item.id === 8)?.cost).toBe(28)
    expect(inventory.find((item) => item.id === 8)?.concept).toBeUndefined()
  })

  it('keeps the reserved Shiny Star V Japanese Poke Kid FA in the shop', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'poke-kid-2020-shiny-star-v-japanese-197')
    const record = inventory.find((item) => item.id === 9)

    expect(product?.title).toBe('Poke Kid')
    expect(product?.price).toBe('€80')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2438647317')
    // Sold on Vinted on 23 September 2026, payout pending: reserved, not sold.
    expect(record?.reserved).toBe(true)
    expect(record?.sold).toBeUndefined()
    expect(record?.soldAt).toBe('2026-09-23')
    expect(productBuyLink(product!)).toEqual({ title: 'This card is reserved' })
    expect(record?.concept).toBeUndefined()
    expect(record?.grade).toBe(10)
    expect(record?.cost).toBe(61)
  })

  it('uses a Marktplaats buy link when the listing URL is set', async () => {
    const { products } = await seededShop()
    const product = products.find((item) => item.slug === 'mewtwo-2016-evolutions-51')
    expect(productBuyLink(product!)).toEqual({
      url: 'https://www.marktplaats.nl/seller/view/m2436737465',
      title: 'View on Marktplaats',
      target: '_blank'
    })
  })

  it('uses a disabled concept CTA when there is no listing URL', () => {
    expect(productBuyLink({})).toEqual({ title: 'Not yet available to buy' })
  })

  it('says a reserved card is reserved instead of linking to its ads', () => {
    expect(
      productBuyLink({
        reserved: true,
        marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436737465',
        vintedUrl: 'https://www.vinted.nl/items/1234567'
      })
    ).toEqual({ title: 'This card is reserved' })
  })

  it('keeps Marktplaats as the only CTA when a Vinted listing also exists', () => {
    expect(
      productBuyLink({
        marktplaatsUrl: 'https://www.marktplaats.nl/seller/view/m2436737465',
        vintedUrl: 'https://www.vinted.nl/items/1234567'
      })
    ).toEqual({
      url: 'https://www.marktplaats.nl/seller/view/m2436737465',
      title: 'View on Marktplaats',
      target: '_blank'
    })
  })

  it('uses Vinted as the primary CTA when there is no Marktplaats listing', () => {
    expect(productBuyLink({ vintedUrl: 'https://www.vinted.nl/items/1234567' })).toEqual({
      url: 'https://www.vinted.nl/items/1234567',
      title: 'View on Vinted',
      target: '_blank'
    })
  })

  it('strips private fields when converting inventory to a public product', async () => {
    const { inventory } = await seededShop()
    const publicProduct = toPublicProduct(inventory[0], inventory[0].slug)
    expect('cost' in publicProduct).toBe(false)
    expect('concept' in publicProduct).toBe(false)
    // Only a reserved card carries the flag; the rest do not say "reserved: false".
    expect('reserved' in publicProduct).toBe(false)
    expect(toPublicProduct({ ...inventory[0], reserved: true }, inventory[0].slug).reserved).toBe(true)
  })
})
