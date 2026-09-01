import type { CardLanguage, InventoryProduct } from '../../database/products'
import { toMediaSrc } from '../imageCopy'
import { parseListedPrice } from '../price'
import { suggestListedPrice, type MarketListing, type PriceSuggestion } from './grades'
import { parseArticleListings } from './html'

export type CardmarketProductReport = {
  id: number
  title: string
  image: string | null
  listed: number
  url: string
  listings: MarketListing[]
  suggestion: PriceSuggestion | null
  gone: MarketListing[]
  error: string | null
}

export type CardmarketReport = {
  scannedAt: string
  products: CardmarketProductReport[]
}

const CHALLENGE =
  /even geduld|just a moment|attention required|sorry, you have been blocked|beveiliging wordt geverifieerd|cf-browser-verification|cf-error-details|checking your browser/i

export function cardmarketOffersUrl(
  url: string,
  language: CardLanguage,
  extras?: { reverseHolo?: boolean; firstEdition?: boolean }
): string {
  const parsed = new URL(url)
  parsed.searchParams.set('language', language === 'japanese' ? '7' : '1')
  parsed.searchParams.set('minCondition', '2')
  if (extras?.reverseHolo) {
    parsed.searchParams.set('extra[isReverseHolo]', 'Y')
  }
  if (extras?.firstEdition) {
    parsed.searchParams.set('extra[isFirstEd]', 'Y')
  }
  return parsed.href
}

export function isCardmarketChallenge(html: string): boolean {
  return CHALLENGE.test(html)
}

export function watchableInventory(products: InventoryProduct[]): InventoryProduct[] {
  return products.filter(
    (product) =>
      product.sold !== true &&
      Boolean(product.cardmarketUrl) &&
      product.grade != null &&
      product.grader != null &&
      product.language != null &&
      parseListedPrice(product.price) != null
  )
}

export async function runCardmarketScan({
  products,
  previous,
  fetchPage,
  now = new Date()
}: {
  products: InventoryProduct[]
  previous: CardmarketReport | null
  fetchPage: (url: string) => Promise<string>
  now?: Date
}): Promise<CardmarketReport> {
  const watched = watchableInventory(products)
  const previousById = new Map((previous?.products ?? []).map((item) => [item.id, item]))

  const productsReport: CardmarketProductReport[] = []
  for (const product of watched) {
    const listed = parseListedPrice(product.price)!
    const url = cardmarketOffersUrl(product.cardmarketUrl!, product.language!, {
      reverseHolo: product.reverseHolo,
      firstEdition: product.firstEdition
    })
    const base: Omit<CardmarketProductReport, 'listings' | 'suggestion' | 'gone' | 'error'> = {
      id: product.id,
      title: product.title,
      image: product.images[0] ? toMediaSrc(product.images[0]) : null,
      listed,
      url
    }

    try {
      const html = await fetchPage(url)
      if (isCardmarketChallenge(html)) {
        productsReport.push({
          ...base,
          listings: [],
          suggestion: null,
          gone: [],
          error: 'Cardmarket blocked the scan (Cloudflare challenge).'
        })
        continue
      }

      const listings = parseArticleListings(html)
      if (listings.length === 0 && !html.includes('articleRow')) {
        productsReport.push({
          ...base,
          listings: [],
          suggestion: null,
          gone: [],
          error: 'No Cardmarket listings found. The page may be blocked or the URL may be wrong.'
        })
        continue
      }

      const suggestion = suggestListedPrice({
        grader: product.grader!,
        grade: product.grade!,
        listed,
        listings
      })
      const currentIds = new Set(listings.map((item) => item.id))
      const gone = (previousById.get(product.id)?.listings ?? []).filter(
        (item) => item.grader === product.grader && item.grade === product.grade && !currentIds.has(item.id)
      )

      productsReport.push({ ...base, listings, suggestion, gone, error: null })
    } catch (error) {
      productsReport.push({
        ...base,
        listings: [],
        suggestion: null,
        gone: [],
        error: error instanceof Error ? error.message : 'Scan failed.'
      })
    }
  }

  return {
    scannedAt: now.toISOString(),
    products: productsReport
  }
}

export function withProductFrontImages(report: CardmarketReport, products: InventoryProduct[]): CardmarketReport {
  const fronts = new Map(products.map((product) => [product.id, product.images[0] ?? null]))
  return {
    ...report,
    products: report.products.map((item) => {
      const src = fronts.get(item.id) ?? item.image
      return {
        ...item,
        image: src ? toMediaSrc(src) : null
      }
    })
  }
}
