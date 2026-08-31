import { parseListedPrice } from '../price'
import { parseSlabComment, type MarketListing } from './grades'

const ARTICLE_ROW = /id="articleRow(\d+)"[\s\S]*?(?=id="articleRow|$)/g

function textsIn(chunk: string): string[] {
  return [...chunk.matchAll(/>([^<]+)</g)].map((match) => match[1].replace(/\s+/g, ' ').trim()).filter(Boolean)
}

export function parseArticleListings(html: string): MarketListing[] {
  const listings: MarketListing[] = []

  for (const match of html.matchAll(ARTICLE_ROW)) {
    const id = match[1]
    const chunk = match[0]
    const texts = textsIn(chunk)
    const sellerMatch = chunk.match(/\/Users\/([^"/]+)/)
    const seller = sellerMatch?.[1] ?? 'unknown'
    const priceText = texts.find((text) => text.includes('€'))
    const price = parseListedPrice(priceText)
    const slab = texts.map(parseSlabComment).find((item) => item != null)

    if (!slab || price == null) {
      continue
    }

    listings.push({
      id,
      seller,
      comment: `${slab.grader === 'psa' ? 'PSA' : 'BGS'} ${slab.grade}`,
      grader: slab.grader,
      grade: slab.grade,
      price
    })
  }

  return listings
}
