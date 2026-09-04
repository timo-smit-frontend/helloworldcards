import type { CardIdentity, PsaLabel } from './types'

/** Cardmarket's own search is unreliable for graded singles; Google finds the product page. */
export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`
}

const SINGLES_LINK = /https?:\/\/(?:www\.)?cardmarket\.com\/(?:[a-z]{2}\/)?Pokemon\/Products\/Singles\/([^/"'\s<>]+)\/([^"'&\s<>]+)/gi

/** Traditional/Simplified Chinese reprints share card numbers with the English set. */
const CHINESE_SET = /traditional-chinese|simplified-chinese|-chinese/i
const CHINESE_PRODUCT = /\d{2,3}C\d/i

/** Cardmarket sets that only ever hold Japanese printings. */
const JAPANESE_SET =
  /japanese|pokemon-card-game|25th-anniversary|golden-box|vstar-universe|vmax-climax|shiny-star-v|shiny-treasure|star-birth|eevee-heroes|blue-sky-stream|fusion-arts|paradigm-trigger|lost-abyss|incandescent-arcana|dark-phantasma|space-juggler|time-gazer|battle-region|terastal-festival|night-wanderer|wild-force|cyber-judge|crimson-haze|mask-of-change|stellar-miracle|super-electric-breaker|heat-wave-arena|battle-partners|clay-burst|snow-hazard|triplet-beat|raging-surf|ruler-of-the-black-flame/i

/**
 * Japanese products end in a lowercase expansion code — `s12a215`, `m2a230`, `smL032` —
 * where English ones use an uppercase set code such as `MEW168` or `SVP176`. The case
 * matters, so this pattern is deliberately not case-insensitive.
 */
const JAPANESE_PRODUCT = /-(?:s|sv|sm|m)\d{0,2}[a-zA-Z]?\d{2,4}$/
const JAPANESE_PROMO = /-[SM]-P\d+$/

function looksJapanese(setSlug: string, productSlug: string): boolean {
  return JAPANESE_SET.test(setSlug) || JAPANESE_PRODUCT.test(productSlug) || JAPANESE_PROMO.test(productSlug)
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
}

/** Strip the noise PSA and sellers add so the query is just the card. */
function queryPart(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  return value
    .replace(/\b(?:GEM\s*MT|GEM\s*MINT|NM-?MT|EX-?MT|MINT)\b/gi, ' ')
    .replace(/\bPSA\b/gi, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/[^\w.&'/#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The Google query. The user's rule of thumb: include the word "cardmarket" and
 * let Google do the matching — searching Cardmarket directly finds the wrong page.
 */
export function buildSearchQuery(identity: CardIdentity, label: PsaLabel | null): string {
  const parts: string[] = []

  if (label) {
    // Label rows in the order PSA prints them: year + set, the card, then the variety.
    parts.push(queryPart(label.year), queryPart(label.setLine), queryPart(label.cardName), queryPart(label.varietyLine))
  } else {
    parts.push(queryPart(identity.name), queryPart(identity.setName))
  }

  if (identity.cardNumber) {
    parts.push(`#${identity.cardNumber}`)
  }

  parts.push(identity.language === 'japanese' ? 'japanese' : 'english', 'cardmarket')

  const seen = new Set<string>()
  return parts
    .join(' ')
    .split(' ')
    .filter((word) => {
      if (!word) {
        return false
      }
      const key = word.toLowerCase()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .join(' ')
}

export function cleanCardmarketUrl(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/[),.;]+$/g, '')
    .replace(/\?.*$/, '')
    .replace(/cardmarket\.com\/[a-z]{2}\//i, 'cardmarket.com/en/')
}

export function scoreCardmarketLink(setSlug: string, productSlug: string, identity: CardIdentity): number {
  let score = 0
  const combined = `${setSlug}/${productSlug}`.toLowerCase()

  const nameWords = words(identity.name)
  if (nameWords.length > 0) {
    // A card number that happens to match in the wrong Pokémon's set must never win.
    score += nameWords.every((word) => combined.includes(word)) ? 30 : -40
  }

  if (identity.cardNumber) {
    const padded = identity.cardNumber.padStart(3, '0')
    const bare = identity.cardNumber.replace(/^0+/, '') || identity.cardNumber
    if (combined.includes(identity.cardNumber.toLowerCase())) {
      score += 12
    }
    if (combined.includes(padded)) {
      score += 6
    }

    if (identity.setCode) {
      const code = identity.setCode.replace(/[^a-z0-9]/gi, '').toLowerCase()
      const slug = productSlug.replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (code && [identity.cardNumber, padded, bare].some((value) => slug.includes(`${code}${value.toLowerCase()}`))) {
        score += 25
      }
    }
  }

  if (identity.language === 'english' && (CHINESE_SET.test(setSlug) || CHINESE_PRODUCT.test(productSlug))) {
    score -= 100
  }

  // An English card must not be priced against a Japanese-only product; Cardmarket
  // serves that page whatever language filter we ask for, so the floor comes out wrong.
  const japanese = looksJapanese(setSlug, productSlug)
  if (identity.language === 'english' && japanese) {
    score -= 60
  }
  if (identity.language === 'japanese' && japanese) {
    score += 10
  }

  // The set the card actually came from, e.g. SWSH-Black-Star-Promos for an SWSH promo.
  const set = `${identity.setCode ?? ''} ${identity.setName ?? ''}`.toLowerCase()
  const setWords = set.split(/[^a-z0-9]+/).filter((word) => word.length > 2)
  if (setWords.length > 0 && setWords.some((word) => setSlug.toLowerCase().includes(word))) {
    score += 15
  }

  if (/black-star-promos/i.test(setSlug) && /promo/i.test(identity.setName ?? '')) {
    score += 8
  }

  return score
}

/** Best Cardmarket singles page in a Google results page, or null when there is none. */
export function pickCardmarketProduct(html: string, identity: CardIdentity): string | null {
  const seen = new Set<string>()
  const ranked: Array<{ url: string; score: number; index: number }> = []

  for (const match of html.matchAll(SINGLES_LINK)) {
    const url = cleanCardmarketUrl(match[0])
    if (seen.has(url)) {
      continue
    }
    seen.add(url)
    ranked.push({ url, score: scoreCardmarketLink(match[1], match[2], identity), index: ranked.length })
  }

  if (ranked.length === 0) {
    return null
  }

  ranked.sort((left, right) => right.score - left.score || left.index - right.index)
  return ranked[0]!.url
}

/** Cardmarket product slug → readable name, e.g. `Mega-Gengar-ex-V1-m2a230` → `Mega Gengar ex`. */
export function cardmarketProductName(url: string): string | null {
  const slug = url.match(/\/Singles\/[^/]+\/([^/?]+)/i)?.[1]
  if (!slug) {
    return null
  }

  const base = slug
    .replace(/-([A-Z]-P\d+)$/i, '')
    .replace(/-([A-Za-z]+\d[A-Za-z]?\d{2,4})$/i, '')
    .replace(/-([A-Za-z]{2,5}\d{2,4})$/i, '')
    .replace(/-(SM\d+|SV\d+[A-Za-z]?|RC\d+)$/i, '')
    .replace(/-V\d+$/i, '')

  const parts = base.split('-').filter(Boolean)
  if (parts.length === 0) {
    return null
  }

  return parts
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === 'ex') return 'ex'
      if (lower === 'gx') return 'GX'
      if (lower === 'v') return 'V'
      if (lower === 'vmax' || lower === 'vstar') return lower.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}
