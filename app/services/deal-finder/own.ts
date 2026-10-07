import type { InventoryProduct } from '../../database/products'
import { parseListedPrice } from '../price'
import { cleanCardmarketUrl } from './google'
import { topCharacter } from './popular'
import type { CardIdentity, OwnHistory, OwnSale } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

/** A product as far as its history is read: the slab, the price, and the dates it was bought and sold. */
export type OwnRecord = Pick<
  Partial<InventoryProduct>,
  | 'title'
  | 'subtitle'
  | 'grader'
  | 'grade'
  | 'language'
  | 'price'
  | 'sold'
  | 'reserved'
  | 'soldAt'
  | 'acquiredAt'
  | 'soldVia'
  | 'cardmarketUrl'
>

/** `2016 Evolutions - #51` → 51, `2020 Shiny Star V Japanese - #197` → 197. */
function subtitleNumber(subtitle: string): number | null {
  const digits = subtitle.match(/#\s*[a-z]*0*(\d+)\b/i)?.[1]
  return digits ? Number(digits) : null
}

function cardNumberDigits(value: string | null): number | null {
  const digits = value?.split('/')[0]!.match(/(\d+)(?!.*\d)/)?.[1]
  return digits ? Number(digits) : null
}

function sameProduct(left: string | undefined, right: string | null): boolean {
  return Boolean(left && right && cleanCardmarketUrl(left).toLowerCase() === cleanCardmarketUrl(right).toLowerCase())
}

function daysBetween(from: string | undefined, to: string | undefined): number | null {
  if (!from || !to) {
    return null
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
  return Number.isFinite(days) && days >= 0 ? days : null
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
}

/** A sale is on the books from the moment it is reserved: sold, still on its way. */
function isSale(product: OwnRecord): boolean {
  return (product.sold === true || product.reserved === true) && Boolean(product.soldAt)
}

/**
 * What the shop's own books say about a card: the times it was sold here, the copy
 * still in stock, and how quickly that character sells.
 *
 * "This card" is the same Cardmarket product — the strongest tie there is — or, for a
 * product with no Cardmarket link, the same character, card number, grade and language.
 */
export function ownHistory({
  card,
  cardmarketUrl,
  products
}: {
  card: Pick<CardIdentity, 'name' | 'cardNumber' | 'language' | 'grade'>
  cardmarketUrl: string | null
  products: OwnRecord[]
}): OwnHistory {
  const character = topCharacter(card.name)
  const number = cardNumberDigits(card.cardNumber)

  const isThisCard = (product: OwnRecord): boolean => {
    if (product.grader !== 'psa' || product.grade !== card.grade || product.language !== card.language) {
      return false
    }
    if (sameProduct(product.cardmarketUrl, cardmarketUrl)) {
      return true
    }
    return (
      character != null && number != null && topCharacter(product.title) === character && subtitleNumber(product.subtitle ?? '') === number
    )
  }

  const sold: OwnSale[] = []
  const inStock: OwnHistory['inStock'] = []
  for (const product of products.filter(isThisCard)) {
    const price = parseListedPrice(product.price)
    if (price == null) {
      continue
    }
    const title = `${product.title ?? ''} ${product.subtitle ?? ''}`.trim()
    if (isSale(product)) {
      sold.push({
        title,
        price,
        soldAt: product.soldAt!,
        daysToSell: daysBetween(product.acquiredAt, product.soldAt),
        via: product.soldVia ?? null
      })
    } else if (product.sold !== true) {
      inStock.push({ title, price })
    }
  }

  const characterDays = character
    ? products
        .filter((product) => isSale(product) && topCharacter(product.title) === character)
        .map((product) => daysBetween(product.acquiredAt, product.soldAt))
        .filter((days): days is number => days != null)
    : []

  return {
    sold: sold.sort((left, right) => right.soldAt.localeCompare(left.soldAt)),
    inStock,
    characterDaysToSell: median(characterDays),
    characterSales: characterDays.length
  }
}
