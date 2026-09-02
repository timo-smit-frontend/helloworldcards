import { MAX_MARKTPLAATS_ASK, MIN_MARKTPLAATS_ASK } from './constants'
import { parseListingCardNumber } from './card-number'
import type { MarktplaatsOverviewListing } from './html'

export type ParsedMarktplaatsTitle = {
  pokemonName: string
  /** Card number only — fraction numerators like 015/113 become 015. */
  cardNumber: string | null
  /** Original fraction or code from the title, kept for set-size inference. */
  cardNumberRaw: string | null
  setName: string | null
  grade: 9 | 10
  language: 'english' | 'japanese'
}

const EXCLUDE_TITLE =
  /\d+\s+graded|\bvarious sets\b|\bmeerdere\b|\bhouder\b|\blijstje\b|\bdisplay\b|\bframe\b|\bcatawiki\b/i

/** Card language other than EN/JP — skip these (German, French, etc.). */
const UNSUPPORTED_CARD_LANGUAGE =
  /\b(?:DE|Deutsch|German|Allemand|Tedesco|FR|Français|Francais|French|Francese|IT|Italiano|Italian|Italienne|ES|Español|Espanol|Spanish|Espagnol|Spagnolo|NL|Nederlands|Dutch|KR|Korean|Koreaans|Coréen|Coreen|CN|CHN|Chinese|Chinois|Cinese|PT|Portuguese|Portugais|RU|Russian|Russisch)\b/i

const JAPANESE_LANGUAGE = /\b(?:JP|JPN|Japanese|Japonais|Japonés|Japones|Japanse|Giapponese)\b/i

const GRADE_RE = /\bPSA\s+(9|10)\b/i
const CARD_FRACTION_RE = /\b(\d{1,3}\/\d{1,3})\b/
const CARD_CODE_RE = /\b([A-Z]{2,4}\d{1,4})\b/
const CARD_HASH_RE = /#(\d{1,4})\b/
/** Yu Nagaba / SV-P promos: "sv-p 068", "SV-P068". */
const CARD_SV_P_RE = /\b(?:sv-?p)\s*#?\s*(\d{1,4})\b/i
/** Trailing set-size style number when nothing else matched: "... s9 116 japanese". */
const CARD_TRAILING_NUM_RE = /\b(\d{2,3})\b(?=\s*(?:japanese|anglais|english|pokemon|card|$))/i

const SET_KEYWORDS =
  /\b(Fossil|Evolutions|Hidden Fates|Brilliant Stars|Paldean Fates|White Flare|Obsidian Flames|Evolving Skies|Southern Island|Sandstorm|Generations|Radiant Collection|Lost Origin|Astral Radiance|Paradox Rift|Temporal Forces|Surging Sparks|Prismatic Evolutions|Black Bolt|Stellar Crown|Shrouded Fable|Twilight Masquerade|Paldea Evolved|Scarlet Violet|Scarlet & Violet|Base Set|Jungle|Team Rocket|Neo Genesis|Neo Destiny|Aquapolis|Skyridge|Celebrations|Crown Zenith|Fusion Strike|Chilling Reign|Battle Styles|Vivid Voltage|Darkness Ablaze|Rebel Clash|Sword & Shield|Sun & Moon)\b/i

const SET_CODE_RE =
  /\b(?:SV|SWSH|SM|XY|BW|CLV|PAF|EVS|LOR|ASR|PAR|TEF|SSP|PRE|MEW|PAL|OBF|DRI|MEP|FO|BS|MA|M\d[A-Za-z]|SV\d[a-z]|m\d[A-Za-z]|sv\d[a-z])\d*[A-Za-z0-9-]*\b/i

function cardmarketSetTag(setName: string | null, cardNumber: string | null): string {
  if (setName && cardNumber) {
    if (setName.toUpperCase() === cardNumber.toUpperCase()) {
      return ` (${setName})`
    }
    return ` (${setName} ${cardNumber})`
  }
  if (setName) {
    return ` (${setName})`
  }
  if (cardNumber) {
    return ` (${cardNumber})`
  }
  return ''
}

function cleanListingPokemonName(name: string, cardNumber: string | null = null): string {
  let trimmed = name
    .replace(/\s+(Art Rare|AR)\b.*$/i, '')
    .replace(/\b(SHINY|ULTRA RARE|ULTRA-RARE|RARE|HOLO|REVERSE HOLO|SECRET|Promo)\b/gi, ' ')
    .replace(/\b(Japanese|Japonais|Japanse|card|Gem mt|Gem|Pokemonkaart|Pokémonkaart|Pokémon|Pokemon)\b/gi, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cardNumber) {
    const bare = cardNumber.replace(/^0+/, '') || cardNumber
    trimmed = trimmed
      .replace(new RegExp(`\\b0*${bare}\\b`, 'g'), ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  if (!trimmed) {
    return trimmed
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function cardmarketPokemonName(name: string, cardNumber: string | null = null): string {
  return cleanListingPokemonName(name, cardNumber)
}

/** Deal list title: `{name} ({set} {number}) EN|JP - PSA {grade}` */
export function formatDealDisplayTitle(parsed: Pick<ParsedMarktplaatsTitle, 'pokemonName' | 'cardNumber' | 'setName' | 'grade' | 'language'>): string {
  const lang = parsed.language === 'japanese' ? 'JP' : 'EN'
  return `${cardmarketPokemonName(parsed.pokemonName, parsed.cardNumber)}${cardmarketSetTag(parsed.setName, parsed.cardNumber)} ${lang} - PSA ${parsed.grade}`
}

function extractSetName(title: string, afterGrade: string): string | null {
  const dash = afterGrade.match(/\s[-–|]\s*(.+)$/)
  if (dash) {
    const segment = dash[1]
      .replace(/\b(EN|English|JP|Japanese|Japonais|Japanse|Mint|GEM MT|MINT|Kaart|Pokémon|Pokemon|Pokémon kaart|Pokemon kaart)\b/gi, ' ')
      .replace(/\b\d{4}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (segment.length >= 2 && segment.length <= 40) {
      const segmentCode = segment.match(SET_CODE_RE)?.[0]
      if (segmentCode) {
        return segmentCode
      }
      return segment
    }
  }

  const keyword = title.match(SET_KEYWORDS)?.[1]
  if (keyword) {
    return keyword
  }

  const setCodes = [...title.matchAll(new RegExp(SET_CODE_RE.source, 'gi'))].map((match) => match[0])
  if (setCodes.length > 0) {
    return setCodes[setCodes.length - 1]!
  }

  return null
}

/** Cardmarket product name from slug, e.g. Mega-Gengar-ex-V1-m2a230 → Mega Gengar ex */
export function parseCardmarketProductName(url: string): string | null {
  const slug = url.match(/\/Singles\/[^/]+\/([^/?]+)/i)?.[1]
  if (!slug) {
    return null
  }

  let base = slug
    // S-P270 (must run before generic set+number, which would leave a stray "S")
    .replace(/-([A-Z]-P\d+)$/i, '')
    // sv7a070, m1L065, m2a230
    .replace(/-([A-Za-z]+\d[A-Za-z]?\d{2,4})$/i, '')
    // PAF215, CLV015, FO20
    .replace(/-([A-Za-z]{2,5}\d{2,4})$/i, '')
    // SM211 / promo codes glued to the slug
    .replace(/-(SM\d+|SV\d+[A-Za-z]?|RC\d+)$/i, '')
    // Art variants V1 / V2 after the set code is gone
    .replace(/-V\d+$/i, '')

  const parts = base.split('-').filter(Boolean)
  if (parts.length === 0) {
    return null
  }

  return parts
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === 'ex') {
        return 'ex'
      }
      if (lower === 'gx') {
        return 'GX'
      }
      if (lower === 'v' || lower === 'vmax' || lower === 'vstar') {
        return lower === 'v' ? 'V' : lower.toUpperCase()
      }
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

/** Read set code + number from a matched Cardmarket product slug. */
export function parseCardmarketProductSlug(url: string): { setCode: string | null; cardNumber: string | null } {
  const slug = url.match(/\/Singles\/[^/]+\/([^/?]+)/i)?.[1]
  if (!slug) {
    return { setCode: null, cardNumber: null }
  }

  const swPromo = slug.match(/-([A-Z]-P)(\d+)$/i)
  if (swPromo) {
    return { setCode: swPromo[1], cardNumber: swPromo[2] }
  }

  const tail = slug.split('-').pop() ?? slug

  const promo = tail.match(/^(SM\d+|SV\d+[A-Za-z]?|RC\d+)$/i)
  if (promo) {
    return { setCode: promo[1], cardNumber: parseListingCardNumber(promo[1]) }
  }

  const setAndNumber = tail.match(/^(.+?)(\d{2,4})$/i)
  if (setAndNumber && /[A-Za-z]/.test(setAndNumber[1]) && setAndNumber[1].length >= 2) {
    return { setCode: setAndNumber[1], cardNumber: setAndNumber[2] }
  }

  return { setCode: null, cardNumber: null }
}

function isKeywordSetName(name: string | null): boolean {
  return name != null && SET_KEYWORDS.test(name)
}

/** Cardmarket-style deal row title for every listing. */
export function buildDealDisplayTitle(input: {
  title: string
  grade: 9 | 10
  cardmarketUrl?: string | null
}): string {
  const parsed = parseMarktplaatsTitle(input.title)
  const fromUrl = input.cardmarketUrl ? parseCardmarketProductSlug(input.cardmarketUrl) : null
  const urlMeta = fromUrl?.setCode && fromUrl.setCode.length >= 2 ? fromUrl : null
  const urlName = input.cardmarketUrl ? parseCardmarketProductName(input.cardmarketUrl) : null

  if (!parsed && !urlMeta?.setCode && !urlName) {
    return input.title
  }

  const setName = isKeywordSetName(parsed?.setName ?? null)
    ? parsed!.setName
    : (urlMeta?.setCode ?? parsed?.setName ?? null)

  // Prefer Cardmarket padding (070 over 70) when the slug matched.
  const cardNumber = urlMeta?.cardNumber ?? parsed?.cardNumber ?? null
  const pokemonName =
    urlName ??
    (parsed ? cleanListingPokemonName(parsed.pokemonName, cardNumber) : input.title.split(/\bPSA\b/i)[0]?.trim() ?? input.title)

  return formatDealDisplayTitle({
    pokemonName,
    setName,
    cardNumber,
    grade: parsed?.grade ?? input.grade,
    language: parsed?.language ?? (JAPANESE_LANGUAGE.test(input.title) ? 'japanese' : 'english')
  })
}

/** Google query from listing title when PSA label OCR fails. Needs a card number or a specific set code. */
export function buildTitleFallbackQuery(parsed: ParsedMarktplaatsTitle): string | null {
  const hasSpecificSet = parsed.setName != null && /^(?:SV|SWSH|SM|XY|PAF|CLV|TEF|EVS|LOR|ASR|PAR|SSP|PRE|MEW|PAL|OBF|DRI|M\d|sv)\S*/i.test(parsed.setName)
  if (!parsed.cardNumber && !hasSpecificSet) {
    return null
  }

  const parts = [parsed.pokemonName.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim()].filter(Boolean)
  if (parsed.setName) {
    parts.push(parsed.setName)
  }
  if (parsed.cardNumber) {
    parts.push(`#${parsed.cardNumber}`)
  }
  if (parsed.language === 'japanese') {
    parts.push('japanese')
  } else {
    parts.push('english')
  }
  parts.push('cardmarket')
  return parts.join(' ')
}

export function isFixedPriceListing(listing: MarktplaatsOverviewListing): boolean {
  return listing.priceType === 'FIXED' || listing.priceType === 'MIN_BID'
}

export function isUnsupportedCardLanguage(title: string): boolean {
  return UNSUPPORTED_CARD_LANGUAGE.test(title)
}

export function shouldExcludeMarktplaatsListing(listing: MarktplaatsOverviewListing): string | null {
  if (!isFixedPriceListing(listing)) {
    return 'No fixed price'
  }

  if (listing.ask < MIN_MARKTPLAATS_ASK) {
    return 'Ask below minimum'
  }

  if (listing.ask > MAX_MARKTPLAATS_ASK) {
    return 'Ask above maximum'
  }

  if (listing.sellerName && /catawiki/i.test(listing.sellerName)) {
    return 'Catawiki seller'
  }

  if (EXCLUDE_TITLE.test(listing.title)) {
    return 'Excluded title pattern'
  }

  if (!GRADE_RE.test(listing.title)) {
    return 'No PSA 9/10 in title'
  }

  if (isUnsupportedCardLanguage(listing.title)) {
    return 'Not English or Japanese'
  }

  return null
}

export function parseMarktplaatsTitle(title: string): ParsedMarktplaatsTitle | null {
  const gradeMatch = title.match(GRADE_RE)
  if (!gradeMatch) {
    return null
  }

  const grade = Number(gradeMatch[1]) as 9 | 10
  const cardNumberRaw =
    title.match(CARD_FRACTION_RE)?.[1] ??
    title.match(CARD_SV_P_RE)?.[0] ??
    title.match(CARD_CODE_RE)?.[1] ??
    title.match(CARD_HASH_RE)?.[1] ??
    title.match(CARD_TRAILING_NUM_RE)?.[1] ??
    null
  const svP = title.match(CARD_SV_P_RE)
  const cardNumber = svP
    ? parseListingCardNumber(svP[1])
    : parseListingCardNumber(cardNumberRaw?.startsWith('sv') ? cardNumberRaw.match(/\d+/)?.[0] : cardNumberRaw)
  const afterGrade = title.slice((gradeMatch.index ?? 0) + gradeMatch[0].length).trim()
  const setName = extractSetName(title, afterGrade)
  const beforeGrade = title.slice(0, gradeMatch.index ?? title.length)

  const cleanName = (raw: string) =>
    raw
      .replace(CARD_FRACTION_RE, ' ')
      .replace(CARD_SV_P_RE, ' ')
      .replace(CARD_CODE_RE, ' ')
      .replace(CARD_HASH_RE, ' ')
      .replace(/\bPSA\b.*$/i, ' ')
      .replace(/\b(Pokémon|Pokemon|Pokémon kaart|Pokemon kaart|Mint|GEM MT|Kaart|full art|super rare)\b/gi, ' ')
      .replace(/\b\d{4}\b/g, ' ')
      .replace(JAPANESE_LANGUAGE, ' ')
      .replace(SET_CODE_RE, ' ')
      .replace(/\(\s*\)/g, ' ')
      .replace(/[()]/g, ' ')
      .replace(/\s[-–|]\s.*$/, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  let pokemonName = cleanName(beforeGrade)

  // Titles like "2022 psa 10 full art roseanne's backup … 116 japanese" put the name after the grade.
  if (!pokemonName || pokemonName.length < 2) {
    pokemonName = cleanName(afterGrade)
      .replace(CARD_TRAILING_NUM_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  if (setName) {
    pokemonName = pokemonName.replace(new RegExp(`\\b${setName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' ').replace(/\s+/g, ' ').trim()
  }

  pokemonName = pokemonName.replace(/\b(Pokémon|Pokemon)\s*$/i, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim()

  if (!pokemonName) {
    return null
  }

  const language = JAPANESE_LANGUAGE.test(title) ? 'japanese' : 'english'

  return {
    pokemonName,
    cardNumber,
    cardNumberRaw: svP ? svP[0] : cardNumberRaw,
    setName,
    grade,
    language
  }
}

export function filterMarktplaatsCandidates(listings: MarktplaatsOverviewListing[]): {
  candidates: Array<MarktplaatsOverviewListing & { parsed: ParsedMarktplaatsTitle }>
  skipped: Array<{ title: string; ask: number | null; reason: string }>
} {
  const candidates: Array<MarktplaatsOverviewListing & { parsed: ParsedMarktplaatsTitle }> = []
  const skipped: Array<{ title: string; ask: number | null; reason: string }> = []

  for (const listing of listings) {
    const exclusion = shouldExcludeMarktplaatsListing(listing)
    if (exclusion) {
      skipped.push({ title: listing.title, ask: listing.ask, reason: exclusion })
      continue
    }

    const parsed = parseMarktplaatsTitle(listing.title)
    if (!parsed) {
      skipped.push({ title: listing.title, ask: listing.ask, reason: 'Could not parse title' })
      continue
    }

    candidates.push({ ...listing, parsed })
  }

  return { candidates, skipped }
}
