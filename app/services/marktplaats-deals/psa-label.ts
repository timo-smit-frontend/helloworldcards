import { parseListingCardNumber } from './card-number'

export type PsaLabelData = {
  /** Left-column lines, e.g. ["2016 POKEMON XY", "MEWTWO-REV.FOIL", "EVOLUTIONS"] */
  rows: string[]
  /** Top-right card number without #, e.g. "51" or "015" from 015/113 */
  cardNumber: string | null
  reverseHolo: boolean
  japanese: boolean
  /** WOTC-era slabs print a "1ST EDITION" row — must not be priced against unlimited comps. */
  firstEdition: boolean
  /** True when the PSA label names a language other than English/Japanese. */
  unsupportedLanguage: boolean
}

/** Require at least one digit so OCR junk like #ii2 is ignored. */
const CARD_NUMBER = /#\s*([A-Z0-9]*\d[A-Z0-9]*(?:\/[A-Z0-9]{1,4})?)\b/i

/** English labels say POKEMON; Japanese slabs often print P.M. / PM. */
const POKEMON_MARKER = /\b(?:POKEMON|P\.?\s*M\.?)\b/i

/** WOTC-era PSA labels print this as its own row, e.g. "1ST EDITION". */
const FIRST_EDITION = /\b1ST\s*ED(?:ITION)?\.?\b|\bFIRST\s+EDITION\b/i

/** PSA prints these when the card is not EN/JP. */
const UNSUPPORTED_LABEL_LANGUAGE = /\b(?:GERMAN|FRENCH|ITALIAN|SPANISH|DUTCH|KOREAN|CHINESE|PORTUGUESE|RUSSIAN|POLISH|SWEDISH)\b/i

/** Short language codes on the PSA header line (e.g. "POKEMON DRI IT"). */
const UNSUPPORTED_LABEL_LANG_CODE = /\b(?:POKEMON|P\.?\s*M\.?)\b[\w\s.#&'/-]{0,48}\b(?:IT|DE|FR|ES|NL|KR|CN|PT|RU)\b/i

/** Fix common OCR swaps in hash numbers (#ii2 → #112, #o41 → #041). */
export function repairOcrCardNumber(raw: string): string | null {
  const repaired = raw
    .replace(/[Oo]/g, '0')
    .replace(/[IiLl]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
  return /^\d{1,4}$/.test(repaired) ? repaired : null
}

/** Pull the top-right #N (or a face print like 041/173) from noisy OCR. */
export function extractCardNumberFromOcr(ocrText: string): string | null {
  const hash = ocrText.match(/#\s*([A-Za-z0-9]{1,6}(?:\/[A-Za-z0-9]{1,4})?)\b/)
  if (hash) {
    const raw = hash[1]
    // Clean PSA numbers are digits (015) or promo codes (SM211) — not OCR mush like ii2.
    if (/^\d{1,4}(?:\/\d{1,4})?$/.test(raw) || /^[A-Z]{1,4}\d{1,4}$/.test(raw)) {
      return parseListingCardNumber(raw)
    }
    const repaired = repairOcrCardNumber(raw)
    if (repaired && /^\d{1,4}$/.test(repaired)) {
      return repaired
    }
  }

  // Face print / OCR noise: 041/173, o41/17308, 041 / 173
  const fraction = ocrText.match(/(?:^|[^\dA-Za-z]|[Oo])(\d{1,3})\s*\/\s*(\d{2,3})/)
  if (fraction) {
    return parseListingCardNumber(`${fraction[1]}/${fraction[2]}`)
  }

  return null
}

/**
 * Parse Tesseract output from a PSA slab front photo into the label fields
 * that Google-search well with "cardmarket".
 */
export function parsePsaLabelOcr(ocrText: string): PsaLabelData | null {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  let cardNumber = extractCardNumberFromOcr(ocrText)
  const candidateRows: string[] = []
  let sawPokemonMarker = false

  for (const line of lines) {
    if (
      /^\d{6,}$/.test(line) ||
      /^UT\b/i.test(line) ||
      /Energy attached|This attack|Weakness|Retreat|Thick Fat|Flip \d+ coins/i.test(line)
    ) {
      // Card-face body text — stop collecting label rows, but keep any # already found.
      if (candidateRows.length >= 1) {
        break
      }
      continue
    }

    const hash = line.match(/#\s*([A-Za-z0-9]{1,6}(?:\/[A-Za-z0-9]{1,4})?)\b/)
    if (hash) {
      cardNumber ??= extractCardNumberFromOcr(`#${hash[1]}`)
    }

    const fraction = line.match(/\b(\d{1,3}\/\d{1,3})\b/)
    if (fraction) {
      cardNumber ??= parseListingCardNumber(fraction[1])
    }

    const cleaned = line
      .replace(CARD_NUMBER, ' ')
      .replace(/\b(\d{1,3}\/[A-Z0-9]{1,4})\b/gi, ' ')
      .replace(/\b(MINT|GEM\s*MT|NM-MT|EX-MT)\b/gi, ' ')
      .replace(/\bPSA\b/gi, ' ')
      .replace(/\s+(?:10|[89])\s*$/g, ' ')
      // OCR noise around the label
      .replace(/[|=_]{2,}/g, ' ')
      .replace(/[^\w.#&\s/-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned || cleaned.length < 3) {
      continue
    }

    // Skip pure noise / grade-only leftovers.
    if (/^(?:\d{1,2}|SITE|BP)$/i.test(cleaned)) {
      continue
    }

    // Wait for the real PSA header line before collecting rows (skip glare junk above it).
    if (!sawPokemonMarker) {
      if (!POKEMON_MARKER.test(cleaned) && !POKEMON_MARKER.test(line)) {
        continue
      }
      sawPokemonMarker = true
    }

    candidateRows.push(cleaned)
    if (candidateRows.length >= 3) {
      break
    }
  }

  if (candidateRows.length === 0) {
    return null
  }

  const blob = candidateRows.join(' ')
  if (!POKEMON_MARKER.test(blob) && !POKEMON_MARKER.test(ocrText)) {
    return null
  }

  return {
    rows: candidateRows.slice(0, 3),
    cardNumber,
    reverseHolo: /REV\.?\s*FOIL|REVERSE|REV\s*HOL/i.test(blob) || /REV\.?\s*FOIL|REVERSE|REV\s*HOL/i.test(ocrText),
    japanese: /\bJAPANESE\b|\bJPN\b|\bJP\b/i.test(blob) || /\bJAPANESE\b|\bJPN\b|\bJP\b/i.test(ocrText),
    firstEdition: FIRST_EDITION.test(blob) || FIRST_EDITION.test(ocrText),
    unsupportedLanguage: UNSUPPORTED_LABEL_LANGUAGE.test(ocrText) || UNSUPPORTED_LABEL_LANG_CODE.test(ocrText)
  }
}

/** Infer a Cardmarket set code from PSA label rows (e.g. SWSH BSP → SWSH). */
export function inferSetCodeFromLabelRows(rows: string[]): string | null {
  const blob = rows.join(' ')
  if (/\bSWSH\b/i.test(blob) && /\bBSP\b/i.test(blob)) {
    return 'SWSH'
  }
  if (/\bSM\b/i.test(blob) && /\bBSP\b/i.test(blob)) {
    return 'SM'
  }
  if (/\bBSP\b/i.test(blob) && /\bXY\b/i.test(blob)) {
    return 'XY'
  }
  const code = blob.match(/\b(CLV|PAF|EVS|LOR|ASR|PAR|TEF|SSP|PRE|MEW|PAL|OBF|SV\d[A-Za-z]?|SWSH|SM)\b/i)
  return code?.[1] ?? null
}

function cleanQueryRow(row: string, isFirst = false): string {
  let cleaned = row
    // PREM.COLL is on the slab but Cardmarket lists the single under SWSH/SM promos — keep it out of Google only.
    .replace(/\bPREM\.?\s*COLL\.?\b/gi, ' ')
    .replace(/\bPREMIUM\s*COLLECTION\b/gi, ' ')
    .replace(/\b(?:ULTRA-?)?PREM\.?\s*COLL\.?\b/gi, ' ')
    .replace(/\bCLBRTNS\.?\b/gi, 'Celebrations')
    .replace(/\bFA\//gi, '')
    .replace(/\b(?:GEM\s*MT|MINT|NM-MT|EX-MT)\b/gi, ' ')
    // Cert / pop numbers (keep years 19xx/20xx).
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\b(?!(?:19|20)\d{2}\b)\d{4,5}\b/g, ' ')
    // Lone grade digits left after MINT stripping.
    .replace(/(?:^|\s)(?:10|[89])(?=\s|$)/g, ' ')
    // Lowercase crumbs + stray uppercase letters (keep V / X stage markers) and lone small numbers.
    .replace(/(?:^|\s)[a-z](?=\s|$)/g, ' ')
    .replace(/(?:^|\s)(?![VX])[A-Z](?=\s|$)/g, ' ')
    .replace(/(?:^|\s)\d{1,2}(?=\s|$)/g, ' ')
    .replace(/\b(?:TT|aa|fF|sa|ia)\b/gi, ' ')
    .replace(/[^\w.#&\s/-]/g, ' ')
    .replace(/\s+\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Drop glare digits glued before the year on the header row ("18 2025 POKEMON…").
  if (isFirst) {
    cleaned = cleaned.replace(/^.*?\b((?:19|20)\d{2}\b.*)$/i, '$1').trim()
  }

  return cleaned
}

/** Google query: the three left rows + #N + cardmarket. */
export function buildGoogleCardmarketQuery(label: PsaLabelData): string {
  const parts = label.rows.map((row, index) => cleanQueryRow(row, index === 0)).filter(Boolean)
  const cardNumber = label.cardNumber && /\d/.test(label.cardNumber) ? label.cardNumber : null
  if (cardNumber) {
    parts.push(`#${cardNumber}`)
  }
  parts.push('cardmarket')
  return parts.join(' ')
}
