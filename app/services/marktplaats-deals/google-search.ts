import { parseListingCardNumber } from './card-number'

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`
}

const SINGLES_LINK = /https?:\/\/(?:www\.)?cardmarket\.com\/(?:[a-z]{2}\/)?Pokemon\/Products\/Singles\/([^/"'\s<>]+)\/([^"'&\s<>]+)/gi

const CHINESE_SET_SLUG = /collect-151|traditional-chinese|simplified-chinese/i
const CHINESE_PRODUCT_SLUG = /151C\d/i

export type CardmarketLinkHint = {
  language: 'english' | 'japanese'
  cardNumber: string | null
  setCode?: string | null
  /** Pokémon name parsed from the listing title, e.g. "Ekans" — scores down links for a
   *  different Pokémon so a matching card number in an unrelated set can't outrank it. */
  pokemonName?: string | null
}

function normalizeForSlugMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** True when every significant word of `name` appears in the product slug, e.g. "Ekans" in "Ekans-TR56". */
function slugMatchesPokemonName(productSlug: string, name: string): boolean {
  const words = normalizeForSlugMatch(name)
    .split('-')
    .filter((word) => word.length > 2)
  if (words.length === 0) {
    return false
  }
  const normalizedSlug = normalizeForSlugMatch(productSlug)
  return words.every((word) => normalizedSlug.includes(word))
}

export function cleanCardmarketUrl(url: string): string {
  const cleaned = url
    .replace(/&amp;/g, '&')
    .replace(/[),.;]+$/g, '')
    .replace(/\?.*$/, '')
  return cleaned.replace(/cardmarket\.com\/[a-z]{2}\//i, 'cardmarket.com/en/')
}

function scoreCardmarketLink(setSlug: string, productSlug: string, hint?: CardmarketLinkHint): number {
  let score = 0
  const combined = `${setSlug}/${productSlug}`

  if (hint?.language === 'english') {
    if (CHINESE_SET_SLUG.test(setSlug)) {
      score -= 100
    }
    if (CHINESE_PRODUCT_SLUG.test(productSlug)) {
      score -= 100
    }
    if (/^151$/i.test(setSlug)) {
      score += 5
    }
  }

  if (/black-star-promos/i.test(setSlug)) {
    score += 8
  }

  if (hint?.pokemonName) {
    // A matching card number in the wrong Pokémon's set must never outrank the right card.
    score += slugMatchesPokemonName(productSlug, hint.pokemonName) ? 30 : -40
  }

  if (hint?.cardNumber) {
    const cardNumber = parseListingCardNumber(hint.cardNumber)
    if (cardNumber && combined.includes(cardNumber)) {
      score += 10
    }
    const stripped = cardNumber?.replace(/^0+/, '')
    if (stripped && stripped !== cardNumber && combined.includes(stripped)) {
      score += 8
    }

    if (hint.setCode) {
      const code = hint.setCode.toUpperCase()
      const padded = cardNumber?.padStart(3, '0') ?? cardNumber
      const candidates = [cardNumber, padded, stripped].filter(Boolean) as string[]
      if (candidates.some((value) => productSlug.toUpperCase().includes(`${code}${value.toUpperCase()}`))) {
        score += 25
      }
    }
  }

  return score
}

export function pickCardmarketProductUrl(html: string, hint?: CardmarketLinkHint): string | null {
  const seen = new Set<string>()
  const ranked: Array<{ url: string; score: number; index: number }> = []

  for (const match of html.matchAll(SINGLES_LINK)) {
    const setSlug = match[1]
    const productSlug = match[2]

    const url = cleanCardmarketUrl(match[0])
    if (seen.has(url)) {
      continue
    }
    seen.add(url)

    ranked.push({ url, score: scoreCardmarketLink(setSlug, productSlug, hint), index: ranked.length })
  }

  if (ranked.length === 0) {
    return null
  }

  ranked.sort((left, right) => right.score - left.score || left.index - right.index)

  if (hint?.language === 'english') {
    const englishFriendly = ranked.filter((entry) => entry.score > -50)
    if (englishFriendly.length > 0) {
      return englishFriendly[0]!.url
    }
  }

  return ranked[0]!.url
}

export function firstCardmarketProductUrl(html: string): string | null {
  return pickCardmarketProductUrl(html)
}
