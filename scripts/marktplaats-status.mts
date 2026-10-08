// Which cards still have their Marktplaats ad up, read off the shop's public Marktplaats
// page: one plain request per thirty ads, no login and no browser. For a card whose ad
// has gone (it expired, or was deleted) it prints what the relist needs; once the new ad
// is up, the link to put on the card. See "Relist an expired ad" in
// .cursor/rules/marktplaats-listings.mdc.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedMediaFiles } from '../app/cms/seed-media'
import { seedProductRecords } from '../app/cms/seed-products'
import type { ProductRecord } from '../app/database/products'
import { MARKTPLAATS_URL } from '../app/services/contact'
import {
  marktplaatsSellerViewUrl,
  marktplaatsShopPageUrl,
  marktplaatsShopStatus,
  parseMarktplaatsShopPage,
  type MarktplaatsShopAd,
  type MarktplaatsShopPage
} from '../app/services/marktplaats'
import { marktplaatsBiedenVanafFromShop, marktplaatsVraagprijsFromShop } from '../app/services/price'
import { originalPhotos } from '../app/services/vinted-relist'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

async function readShopPage(page: number): Promise<MarktplaatsShopPage> {
  const url = marktplaatsShopPageUrl(MARKTPLAATS_URL, page)
  const response = await fetch(url, {
    headers: {
      'user-agent': BROWSER_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'nl-NL,nl;q=0.9,en;q=0.8'
    }
  })
  if (!response.ok) {
    throw new Error(`Marktplaats answered ${response.status} for ${url}.`)
  }
  const shop = parseMarktplaatsShopPage(await response.text())
  if (!shop) {
    throw new Error(`${url} did not list the shop's ads (a bot check, or Marktplaats changed the page).`)
  }
  return shop
}

/** Every live ad, or an error: an ad missing from a page that was only half read is not gone. */
async function readLiveAds(): Promise<MarktplaatsShopAd[]> {
  const first = await readShopPage(1)
  const ads = new Map(first.ads.map((ad) => [ad.itemId, ad]))
  for (let page = 2; page <= first.pages; page += 1) {
    for (const ad of (await readShopPage(page)).ads) {
      ads.set(ad.itemId, ad)
    }
  }
  if (ads.size < first.total) {
    throw new Error(`The shop page listed ${ads.size} of its ${first.total} ads, so which ads are gone cannot be told.`)
  }
  return [...ads.values()]
}

/** The files a relist uploads, in order: the branded ad photo, then the slab front and back. */
function relistPhotos(card: ProductRecord): string[] {
  const originals = originalPhotos({ images: card.images ?? [] })
  if (!originals) {
    return []
  }

  const files = originals.ad ? [path.join(root, originals.ad)] : []
  for (const key of originals.media) {
    const seed = seedMediaFiles.find((file) => file.key === key)
    const cached = path.join(root, '.cache/media-originals', key)
    files.push(
      seed ? path.join(root, 'seed/media', seed.filename) : existsSync(cached) ? cached : `https://helloworldcards.com/media/${key}`
    )
  }
  return files.map((file) => (file.startsWith('https:') ? `${file} (download it first)` : existsSync(file) ? file : `${file} (missing)`))
}

const cardName = (card: ProductRecord) => `${card.title} (${card.subtitle}, id ${card.id})`
const adLine = (ad: MarktplaatsShopAd) => `${ad.itemId} "${ad.title}", placed ${ad.date || 'on an unknown date'}`

let ads: MarktplaatsShopAd[]
try {
  ads = await readLiveAds()
} catch (error) {
  console.error(`marktplaats-status: ${(error as Error).message}`)
  process.exit(1)
}

const status = marktplaatsShopStatus(seedProductRecords, ads)
const forSale = status.cards.filter((row) => !row.card.concept && !row.card.reserved)
const gone = forSale.filter((row) => row.ad !== 'live' && !row.newAd)
const relisted = status.cards.flatMap(({ card, newAd }) => (newAd ? [{ card, newAd }] : []))

console.log(`${ads.length} live ads on ${MARKTPLAATS_URL}`)

if (gone.length > 0) {
  console.log('\nGone from Marktplaats, relist:')
  for (const { card, ad } of gone) {
    console.log(`  ${cardName(card)}: ${ad === 'gone' ? `${card.marktplaatsUrl} is no longer up` : 'no Marktplaats link'}`)
    console.log(
      `    Vraagprijs ${marktplaatsVraagprijsFromShop(card.price) ?? '?'}, Bieden vanaf ${marktplaatsBiedenVanafFromShop(card.price) ?? '?'} (shop ${card.price ?? '?'}), Direct Kopen on`
    )
    for (const file of relistPhotos(card)) {
      console.log(`    ${file}`)
    }
  }
}

if (relisted.length > 0) {
  console.log('\nUp again, point the card at its new ad:')
  for (const { card, newAd } of relisted) {
    const note = card.concept ? ' (still concept)' : card.reserved ? ' (reserved)' : ''
    console.log(`  ${cardName(card)}${note} → ${marktplaatsSellerViewUrl(newAd.itemId)}`)
    console.log(`    ${adLine(newAd)}`)
  }
}

if (status.soldButLive.length > 0) {
  console.log('\nSold, but the ad is still up:')
  for (const { card, ad } of status.soldButLive) {
    console.log(`  ${cardName(card)}: ${adLine(ad)}`)
  }
}

if (status.unclaimed.length > 0) {
  console.log('\nLive ads no card links to:')
  for (const ad of status.unclaimed) {
    console.log(`  ${adLine(ad)}`)
  }
}

const up = forSale.filter((row) => row.ad === 'live').map((row) => row.card.title)
const reserved = status.cards
  .filter((row) => row.card.reserved)
  .map((row) => `${row.card.title}${row.ad === 'live' ? '' : ' (ad gone, nothing to relist)'}`)
console.log(`\nUp (${up.length}): ${up.join(', ') || 'none'}`)
if (reserved.length > 0) {
  console.log(`Reserved (${reserved.length}): ${reserved.join(', ')}`)
}
