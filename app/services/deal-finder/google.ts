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
    .replace(/[^\w.&'#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One- and two-character tokens that mean something on a Pokémon card. */
const SHORT_TOKENS = new Set(['ex', 'gx', 'v'])

/**
 * OCR debris — the slab's printed border, a barcode fragment, half a clipped word —
 * comes back as short scraps: `WL`, `ES`, `CR`, `2LL`, `=X`. Google reads every one of
 * them as a search term and stops finding the card, so a token only survives when it is
 * long enough to be a real word or number, or is one of the suffixes a card name ends in.
 */
function isQueryToken(token: string): boolean {
  if (!/[a-z0-9]/i.test(token)) {
    return false
  }
  // A token that opens with a digit is a year or a number; `2LL` is a misread border.
  // Japanese set codes open with a letter — `s8b`, `sv2a` — so they are untouched.
  if (/^\d/.test(token) && !/^\d+$/.test(token)) {
    return false
  }
  return token.length >= 3 || SHORT_TOKENS.has(token.toLowerCase())
}

/**
 * The Google query. The user's rule of thumb: include the word "cardmarket" and
 * let Google do the matching — searching Cardmarket directly finds the wrong page.
 */
export function buildSearchQuery(identity: CardIdentity, label: PsaLabel | null): string {
  const parts: string[] = []

  if (label) {
    // Label rows in the order PSA prints them: year + set, the card, then the variety.
    // The card is the identity's name rather than the label's own row, because that is
    // the one the identity fell back to the listing title for when the row was unreadable.
    parts.push(queryPart(label.year), queryPart(label.setLine), queryPart(identity.name), queryPart(label.varietyLine))
  } else {
    parts.push(queryPart(identity.name), queryPart(identity.setName))
  }

  // The card number and the last three words are ours, not the slab's, so they are added
  // after the reading has been sieved rather than being sieved along with it.
  const words = parts.join(' ').split(' ').filter(isQueryToken)
  if (identity.cardNumber) {
    words.push(`#${identity.cardNumber}`)
  }
  words.push(identity.language === 'japanese' ? 'japanese' : 'english', 'cardmarket')

  const seen = new Set<string>()
  return words
    .filter((word) => {
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

/**
 * Cardmarket ends a product slug with its set code and the card's own number —
 * `MEW168`, `sv2a206`, `S-P068`. A trailing `-V2` is not that: it is how Cardmarket
 * tells two products of the same name apart.
 */
export function productCardNumber(productSlug: string): string | null {
  const last = productSlug.split('-').pop() ?? ''
  if (/^V\d+$/i.test(last)) {
    return null
  }
  return last.match(/(\d+)$/)?.[1] ?? null
}

export function scoreCardmarketLink(setSlug: string, productSlug: string, identity: CardIdentity): number {
  let score = 0
  const combined = `${setSlug}/${productSlug}`.toLowerCase()

  const nameWords = words(identity.name)
  if (nameWords.length > 0) {
    // How much of the name is on the page, not whether every last word of it is. PSA
    // abbreviates on the slab — `RAICHU/ALN.RAICHU GX` for Alolan Raichu — and the
    // reader leaves debris behind — `BIA MMT PIKACHU` — so demanding a whole match
    // threw away the right page over one scrap. Nothing matching at all is still the
    // veto it always was: a card number matching in the wrong Pokémon must never win.
    const matched = nameWords.filter((word) => combined.includes(word)).length
    score += matched === 0 ? -40 : Math.round((matched / nameWords.length) * 40) - 10
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

    // Cardmarket sells the same card twice under different numbers — Erika's Invitation
    // is #39 in the set and #206 as the special art — and the two are nowhere near the
    // same price. A product that names a different number than the slab is another card.
    const product = productCardNumber(productSlug)
    if (product && Number(product) !== Number(bare)) {
      score -= 45
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

/** Score a whole Cardmarket URL, or null when it is not a singles product page at all. */
export function scoreCardmarketUrl(url: string, identity: CardIdentity): number | null {
  const parts = url.match(/cardmarket\.com\/(?:[a-z]{2}\/)?Pokemon\/Products\/Singles\/([^/?#]+)\/([^/?#]+)/i)
  return parts ? scoreCardmarketLink(parts[1]!, parts[2]!, identity) : null
}

/**
 * Google stopped printing result URLs. Every organic result is now an opaque redirect
 * — `/goto?url=CAESkQEB…` — with the destination nowhere in the page, so the only
 * things a results page still hands over are the result's title and that redirect.
 * The pair sits in Google's embedded data as `"<title>",null,"/goto?url=<token>"`.
 */
const GOOGLE_RESULT = /"((?:[^"\\]|\\.){5,200})",(?:null,)+"(\/goto\?url(?:\\u003d|=)[A-Za-z0-9_%-]+)"/g

function unescapeJson(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string
  } catch {
    return value
  }
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Cardmarket titles its singles pages `Houndour (OBF 204) Obsidian Flames - Singles -
 * Cardmarket`, so the title alone carries the card, its set code and number, and the
 * set — everything the URL used to. Reassembling those into the slug pair Cardmarket
 * would have used lets a title be judged by exactly the same scoring as a real link.
 * A title with no card number in brackets is a species or set page, not a single.
 */
export function cardmarketTitleSlugs(title: string): { setSlug: string; productSlug: string } | null {
  if (!/cardmarket/i.test(title)) {
    return null
  }

  const parsed = title.match(/^(.+?)\s*\(([^)]+)\)\s*(.*)$/)
  if (!parsed) {
    return null
  }

  const inside = parsed[2]!.trim().match(/^(?:(.*?)\s+)?([A-Za-z]{0,4}\d{1,4}[A-Za-z]?)$/)
  if (!inside) {
    return null
  }

  const name = slug(parsed[1]!)
  // Everything up to the first separator is the set; `- Singles - Cardmarket` is chrome.
  const rest = parsed[3]!.replace(/^[\s\-\u2013\u2014|]+/, '').split(/\s+[-\u2013\u2014|]\s+/)[0] ?? ''
  const setSlug = slug(rest)
  if (!name || !setSlug || /^(?:Singles|Cardmarket)$/i.test(setSlug)) {
    return null
  }

  return { setSlug, productSlug: `${name}-${inside[1] ? slug(inside[1]) : ''}${inside[2]!}` }
}

/** A Cardmarket page a Google results page points at, and how good a match it looks. */
export type CardmarketCandidate = {
  /** The product page, or the Google redirect that has to be followed to reach it. */
  url: string
  /** True when `url` is Google's redirect rather than the Cardmarket page itself. */
  redirect: boolean
  score: number
}

/** Every Cardmarket product a Google results page offers for this card, best first. */
export function rankCardmarketCandidates(html: string, identity: CardIdentity): CardmarketCandidate[] {
  const best = new Map<string, { candidate: CardmarketCandidate; index: number }>()

  const consider = (key: string, candidate: CardmarketCandidate) => {
    const previous = best.get(key)
    if (!previous || candidate.score > previous.candidate.score) {
      best.set(key, { candidate, index: previous?.index ?? best.size })
    }
  }

  for (const match of html.matchAll(SINGLES_LINK)) {
    const url = cleanCardmarketUrl(match[0])
    consider(url, { url, redirect: false, score: scoreCardmarketLink(match[1]!, match[2]!, identity) })
  }

  for (const match of html.matchAll(GOOGLE_RESULT)) {
    const slugs = cardmarketTitleSlugs(unescapeJson(match[1]!))
    if (!slugs) {
      continue
    }
    const path = match[2]!.replace(/\\u003d/g, '=')
    consider(path, {
      url: `https://www.google.com${path}`,
      redirect: true,
      score: scoreCardmarketLink(slugs.setSlug, slugs.productSlug, identity)
    })
  }

  // Nothing that looks like a different card: a wrong identification is what makes the
  // whole report untrustworthy, so no answer is worth more than a price for another card.
  return [...best.values()]
    .filter((entry) => entry.candidate.score >= 0)
    .sort((left, right) => right.candidate.score - left.candidate.score || left.index - right.index)
    .map((entry) => entry.candidate)
}

/**
 * Best Cardmarket singles page a results page links to outright, or null when there is
 * none. Google itself no longer prints those, so this only answers for pages that do —
 * the scan follows `rankCardmarketCandidates` and resolves the redirects instead.
 */
export function pickCardmarketProduct(html: string, identity: CardIdentity): string | null {
  return rankCardmarketCandidates(html, identity).find((candidate) => !candidate.redirect)?.url ?? null
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
