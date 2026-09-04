import type { CardLanguage, PsaGrade } from './types'

/** PSA prints the grade as a word plus a number; sellers write it every way imaginable. */
const GRADE = /\bpsa\s*(?:gem\s*mint|gem\s*mt|gem|mint|nm-?mt)?\s*(10|9)\b(?!\s*[./]\d)/i
/** Any PSA grade, so a PSA 8 listing is recognised and dropped rather than misread. */
const ANY_GRADE = /\bpsa\s*(?:gem\s*mint|gem\s*mt|gem|mint|nm-?mt)?\s*(\d{1,2}(?:\.\d)?)\b/i

const JAPANESE = /\b(?:jp|jpn|jap|japan|japans|japanse|japanees|japanese|japon|japonais|japonés|japones|giapponese|japones[ae]?)\b/i

/**
 * A listing written in French, German, Spanish or Italian is selling that language's
 * card even when the title names no language — "Vends Amphinobi GX" is a French
 * Greninja. Only unambiguous words, never bare country codes: "de" and "it" are
 * ordinary Dutch and English words and cost us real English cards last time.
 */
const FOREIGN_LISTING =
  /\b(?:vends|vendu|achat|livraison|neuve|carte|cartes|fran[cç]aise?|verkaufe|karte|karten|zustand|neuwertig|versand|deutsche?|vendo|carta|cartas|nueva|env[ií]o|spedizione|condizioni|italiana?|espa[nñ]ola?)\b/i

/** "VF" is version française; uppercase only, so it cannot match ordinary words. */
const FOREIGN_CODE = /\bVF\b|\bVFR\b/

/** PSA also slabs these, but we only buy English and Japanese. */
const OTHER_LANGUAGE =
  /\b(?:duits|duitse|german|deutsch|allemand|tedesco|frans|franse|french|fran[cç]ais|francese|italiaan|italiaans|italian|italiano|italienne|ita|spaans|spaanse|spanish|espa[nñ]ol|espagnol|spagnolo|koreaans|korean|cor[ée]en|chinees|chinese|chinois|cinese|portugees|portuguese|portugais|russisch|russian|pools|polish)\b/i

/** Japanese expansions print codes like s8b, sv2a, m2a — a letter block then digits. */
const JAPANESE_SET_CODE = /^(?:s|sv|m)\d{1,2}[a-z]?$/i

/** Sellers list several slabs in one ad; those cannot be priced as one card. */
const LOT_TITLE =
  /\b(?:\d+\s*(?:x|stuks|graded|kaarten|cards|slabs)|lot|bundel|bundle|verzameling|collectie|meerdere|various sets|partij)\b/i

const GRADE_WORDS = /\b(?:gem\s*mt|gem\s*mint|nm-?mt|ex-?mt|mint)\b/gi
const YEARS = /\b(?:19|20)\d{2}\b/g
const PRICES = /(?:€\s*\d+(?:[.,]\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\s*(?:euro|eur)\b)/gi

/** Set names we can recognise straight from the listing text, longest first so
 *  "Scarlet & Violet 151" wins over a bare "151" that would look like a card number. */
const SET_NAMES = [
  'scarlet & violet 151',
  'scarlet and violet 151',
  'prismatic evolutions',
  'paldean fates',
  'paradox rift',
  'temporal forces',
  'twilight masquerade',
  'shrouded fable',
  'stellar crown',
  'surging sparks',
  'journey together',
  'destined rivals',
  'black bolt',
  'white flare',
  'mega dream',
  'obsidian flames',
  'paldea evolved',
  'crown zenith',
  'silver tempest',
  'lost origin',
  'astral radiance',
  'brilliant stars',
  'fusion strike',
  'celebrations',
  'evolving skies',
  'chilling reign',
  'battle styles',
  'shining fates',
  'vivid voltage',
  'champions path',
  "champion's path",
  'darkness ablaze',
  'rebel clash',
  'cosmic eclipse',
  'hidden fates',
  'unified minds',
  'unbroken bonds',
  'detective pikachu',
  'team up',
  'lost thunder',
  'dragon majesty',
  'celestial storm',
  'forbidden light',
  'ultra prism',
  'crimson invasion',
  'shining legends',
  'burning shadows',
  'guardians rising',
  'evolutions',
  'steam siege',
  'fates collide',
  'breakpoint',
  'breakthrough',
  'ancient origins',
  'roaring skies',
  'primal clash',
  'phantom forces',
  'furious fists',
  'flashfire',
  'base set',
  'jungle',
  'fossil',
  'team rocket',
  'gym heroes',
  'gym challenge',
  'neo genesis',
  'neo discovery',
  'neo revelation',
  'neo destiny',
  'legendary collection',
  'expedition',
  'aquapolis',
  'skyridge',
  'southern island',
  'vstar universe',
  'shiny star v',
  'shiny treasure',
  'vmax climax',
  'paradigm trigger',
  'fusion arts',
  'star birth',
  'battle partners',
  'terastal festival',
  'night wanderer',
  'clay burst',
  'snow hazard',
  'triplet beat',
  'raging surf',
  'ruler of the black flame',
  'wild force',
  'cyber judge',
  'crimson haze',
  'mask of change',
  'stellar miracle',
  'supercharged breaker',
  'heat wave arena',
  'black star promos',
  'premium collection',
  'ultra premium collection'
]

/** Era names only identify a set when no expansion inside that era was named:
 *  "Sword & Shield Fusion Arts" is the Fusion Arts set, not the whole era. */
const SET_ERAS = [
  'scarlet & violet',
  'scarlet and violet',
  'sword & shield',
  'sword and shield',
  'sun & moon',
  'sun and moon',
  'mega evolution'
]

/** Cardmarket-style expansion codes that identify a set on their own. */
const SET_CODE =
  /\b(?:sv-?p|svp|sve|swsh|sm|xy|bw|hgss|dp|clv|paf|evs|lor|asr|par|tef|ssp|pre|mew|pal|obf|dri|twm|sfa|scr|jtg|blk|wht|mep|prb|s-?p|m-?p|s\d{1,2}[a-z]?|sv\d{1,2}[a-z]?|m\d{1,2}[a-z]?)\b/i

export function detectGrade(text: string): PsaGrade | null {
  const match = text.match(GRADE)
  return match ? (Number(match[1]) as PsaGrade) : null
}

/** The grade a seller claims, whatever it is — used to explain why a listing was dropped. */
export function detectAnyGrade(text: string): number | null {
  const match = text.match(ANY_GRADE)
  return match ? Number(match[1]) : null
}

export function detectLanguage(text: string): CardLanguage | 'other' | null {
  if (JAPANESE.test(text)) {
    return 'japanese'
  }
  if (OTHER_LANGUAGE.test(text) || FOREIGN_LISTING.test(text) || FOREIGN_CODE.test(text)) {
    return 'other'
  }
  return null
}

export function isJapaneseSetCode(code: string | null): boolean {
  return code != null && JAPANESE_SET_CODE.test(code)
}

export function looksLikeLot(text: string): boolean {
  if (LOT_TITLE.test(text)) {
    return true
  }
  // "Espeon #175 & Umbreon #176" — two card numbers joined is two cards.
  const numbers = [...text.matchAll(/#\s*\d{1,4}\b/g)]
  if (numbers.length > 1) {
    return true
  }
  if ([...text.matchAll(/\bpsa\s*\d{1,2}\b/gi)].length > 1) {
    return true
  }

  // "Pikachu V & Wigglytuff GX" — two named cards joined is two slabs, even when the
  // seller ticked "single card" on the form.
  return /\b(?:ex|gx|vmax|vstar|v)\b[^&+]{0,24}(?:&|\+|\ben\b)[^&+]{0,24}\b(?:ex|gx|vmax|vstar|v)\b/i.test(text)
}

/** Blank out everything that looks like a number but never is a card number. */
function maskNoise(text: string): string {
  return text
    .replace(GRADE_WORDS, ' ')
    .replace(/\bpsa\s*(?:gem\s*mint|gem\s*mt|gem|mint|nm-?mt)?\s*\d{1,2}(?:\.\d)?\b/gi, ' ')
    .replace(/\b(?:bgs|cgc|ace)\s*\d{1,2}(?:\.\d)?\b/gi, ' ')
    .replace(PRICES, ' ')
    .replace(YEARS, ' ')
}

export function detectSet(text: string): { name: string | null; code: string | null; matched: string | null } {
  const haystack = text.toLowerCase()
  for (const candidate of [...SET_NAMES, ...SET_ERAS]) {
    const at = haystack.indexOf(candidate)
    if (at !== -1) {
      const matched = text.slice(at, at + candidate.length)
      return { name: matched, code: text.match(SET_CODE)?.[0] ?? null, matched }
    }
  }

  const code = maskNoise(text).match(SET_CODE)?.[0] ?? null
  return { name: code, code, matched: code }
}

/**
 * The card number, in the order PSA and sellers write it:
 * `168/165` → 168, `#176`, `no.022`, `SV-P 068`, `s8b 245`, then a bare number
 * once the grade, year, price and set name can no longer be mistaken for one.
 */
export function detectCardNumber(
  text: string,
  setMatch: string | null = null,
  { allowBare = true }: { allowBare?: boolean } = {}
): string | null {
  let working = maskNoise(text)
  if (setMatch) {
    working = working.replace(setMatch, ' ')
  }

  const fraction = working.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/)
  if (fraction) {
    return normalizeCardNumber(fraction[1])
  }

  const explicit = working.match(/(?:#|\bnr\.?|\bno\.?|\bnummer)\s*([a-z]{0,3}\d{1,4})\b/i)
  if (explicit) {
    return normalizeCardNumber(explicit[1])
  }

  const promo = working.match(/\b(?:sv-?p|s-?p|m-?p|sm|swsh|xy|bw)\s*#?\s*(\d{1,3})\b/i)
  if (promo) {
    return normalizeCardNumber(promo[1])
  }

  const afterCode = working.match(/\b(?:[a-z]{1,3}\d{1,2}[a-z]?)\s+(\d{1,3})\b/i)
  if (afterCode) {
    return normalizeCardNumber(afterCode[1])
  }

  if (!allowBare) {
    return null
  }

  // Two digits minimum, and never a bare 10: in this feed a loose "9" or "10" is the
  // grade far more often than the card. A real card 10 still reads as #10, 010 or 10/102.
  const bare = working.match(/(?:^|[\s(|])(\d{2,3})(?=[\s)|,.]|$)/)
  if (!bare || bare[1] === '10') {
    return null
  }
  return normalizeCardNumber(bare[1])
}

/** `015/113` and `15` are the same card; Cardmarket pads, so keep the digits as written. */
export function normalizeCardNumber(raw: string | null | undefined): string | null {
  if (!raw) {
    return null
  }
  const trimmed = raw.trim()
  const fraction = trimmed.match(/^(\d{1,3})\/(\d{1,3})$/)
  return (fraction ? fraction[1] : trimmed) || null
}

const NAME_NOISE =
  /\b(?:te koop|aangeboden|pokemon|pokémon|pokemonkaart|pokémonkaart|kaart|kaarten|card|cards|carte|graded|grading|gegradeerd|beoordeeld|slab|holo|holographique|reverse|rev|foil|full art|fullart|fa|art rare|ultra rare|special art rare|secret rare|illustration rare|rare|promo|mint|gem|nieuw|new|staat|zeldzame|zeldzaam|prachtige|mooie|sealed|shiny|vintage|en|eng|english|engels|engelse)\b/gi

/**
 * A best-effort card name from the listing text. The PSA label is the better
 * source when we can read it — this keeps the Google query usable when we cannot.
 */
export function detectCardName(text: string, setMatch: string | null, cardNumber: string | null): string {
  let working = maskNoise(text)
  if (setMatch) {
    working = working.replace(new RegExp(escapeRegExp(setMatch), 'gi'), ' ')
  }

  for (const era of SET_ERAS) {
    working = working.replace(new RegExp(escapeRegExp(era).replace(/&/g, '(?:&|and)'), 'gi'), ' ')
  }

  working = working
    .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, ' ')
    .replace(/(?:#|\bnr\.?|\bno\.?)\s*[a-z]{0,3}\d{1,4}\b/gi, ' ')
    .replace(SET_CODE, ' ')
    .replace(JAPANESE, ' ')
    .replace(OTHER_LANGUAGE, ' ')
    .replace(NAME_NOISE, ' ')

  if (cardNumber) {
    working = working.replace(new RegExp(`\\b0*${escapeRegExp(cardNumber.replace(/^0+/, '') || cardNumber)}\\b`, 'g'), ' ')
  }

  const cleaned = working
    .replace(/[|–—-]+/g, ' ')
    .replace(/[()[\]{}:;,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Keep the leading words — sellers lead with the card, then pile on adjectives.
  const words = cleaned.split(' ').filter((word) => word.length > 1 || /^[a-z]$/i.test(word))
  return words.slice(0, 5).join(' ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function isFirstEdition(text: string): boolean {
  return /\b(?:1st\s*ed(?:ition)?|first\s+edition|1e\s*editie|eerste\s+editie)\b/i.test(text)
}

export function isReverseHolo(text: string): boolean {
  return /\b(?:reverse\s*holo|rev\.?\s*foil|rev\s*holo|reverse)\b/i.test(text)
}
