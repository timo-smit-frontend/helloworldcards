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
      [3, 'Charizard', '2016 Radiant Collection - #RC5', 'charizard-2016-radiant-collection-rc5'],
      [4, 'Ekans', '2000 Team Rocket - #56', 'ekans-2000-team-rocket-56'],
      [5, 'Zorua AR', '2025 White Flare Japanese - #140', 'zorua-ar-2025-white-flare-japanese-140'],
      [6, 'Arceus V', '2022 Brilliant Stars - #165', 'arceus-v-2022-brilliant-stars-165'],
      [7, 'Mega Latias ex', '2025 Mega Evolution - #181', 'mega-latias-ex-2025-mega-evolution-181'],
      [8, 'Zekrom', '2022 Brilliant Stars - #TG05', 'zekrom-2022-brilliant-stars-tg05'],
      [9, 'Poke Kid', '2020 Shiny Star V Japanese - #197', 'poke-kid-2020-shiny-star-v-japanese-197']
    ])
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

    const { inventory, products } = await seededShop()
    const sold = inventory.filter((item) => item.sold)
    const shopIds = new Set(products.map((product) => product.id))

    for (const item of sold) {
      expect(shopIds.has(item.id)).toBe(false)
    }
  })

  it('marks Arceus, Latias, Zekrom, and Poke Kid as concept inventory without listing URLs', async () => {
    const { inventory, products } = await seededShop()
    const liveIds = [1, 2, 3, 4, 5]
    const conceptIds = [6, 7, 8, 9]

    for (const id of liveIds) {
      const item = inventory.find((product) => product.id === id)
      expect(item?.concept).toBeUndefined()
      expect(item?.marktplaatsUrl).toMatch(/^https:\/\/www\.marktplaats\.nl\//)
    }

    for (const id of conceptIds) {
      const item = inventory.find((product) => product.id === id)
      expect(item?.concept).toBe(true)
      expect(item?.marktplaatsUrl).toBeUndefined()
      expect(products.some((product) => product.id === id)).toBe(true)
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
    expect(product?.price).toBe('€95')
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
    expect(product?.price).toBe('€45')
    expect(product?.marktplaatsUrl).toBe('https://www.marktplaats.nl/seller/view/m2436737892')
    expect(product?.images).toEqual(['/media/76719295_front.jpg', '/media/76719295_back.jpg'])
    expect(inventory.find((item) => item.id === 2)?.cost).toBe(30)
  })

  it('lists the Generations Charizard with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'charizard-2016-radiant-collection-rc5')

    expect(product?.title).toBe('Charizard')
    expect(product?.pokemonId).toBe(6)
    expect(product?.price).toBe('€125')
    expect(product?.images).toEqual(['/media/61958598_front.jpg', '/media/61958598_back.jpg'])
    expect(inventory.find((item) => item.id === 3)?.cost).toBe(75)
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
    expect(product?.price).toBe('€65')
    expect(record?.cost).toBe(40)
    expect(record?.acquiredAt).toBe('2026-08-30')
  })

  it('lists the Brilliant Stars Arceus V with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'arceus-v-2022-brilliant-stars-165')

    expect(product?.title).toBe('Arceus V')
    expect(product?.price).toBe('€50')
    expect(inventory.find((item) => item.id === 6)?.cost).toBe(28)
    expect(inventory.find((item) => item.id === 6)?.concept).toBe(true)
  })

  it('lists the Mega Evolution Mega Latias ex SIR with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'mega-latias-ex-2025-mega-evolution-181')

    expect(product?.title).toBe('Mega Latias ex')
    expect(product?.price).toBe('€120')
    expect(inventory.find((item) => item.id === 7)?.cost).toBe(72)
  })

  it('lists the Brilliant Stars Trainer Gallery Zekrom with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'zekrom-2022-brilliant-stars-tg05')

    expect(product?.title).toBe('Zekrom')
    expect(product?.price).toBe('€60')
    expect(inventory.find((item) => item.id === 8)?.cost).toBe(28)
  })

  it('lists the Shiny Star V Japanese Poke Kid FA with slab photos', async () => {
    const { inventory, products } = await seededShop()
    const product = products.find((item) => item.slug === 'poke-kid-2020-shiny-star-v-japanese-197')
    const record = inventory.find((item) => item.id === 9)

    expect(product?.title).toBe('Poke Kid')
    expect(product?.price).toBe('€95')
    expect(product?.marktplaatsUrl).toBeUndefined()
    expect(record?.concept).toBe(true)
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

  it('uses a disabled concept CTA when there is no listing URL', async () => {
    const { products } = await seededShop()
    const product = products.find((item) => item.slug === 'zekrom-2022-brilliant-stars-tg05')
    expect(product?.marktplaatsUrl).toBeUndefined()
    expect(productBuyLink(product!)).toEqual({ title: 'Not yet available to buy' })
  })

  it('strips private fields when converting inventory to a public product', async () => {
    const { inventory } = await seededShop()
    const publicProduct = toPublicProduct(inventory[0], inventory[0].slug)
    expect('cost' in publicProduct).toBe(false)
    expect('concept' in publicProduct).toBe(false)
  })
})
