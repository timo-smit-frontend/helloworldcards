import { normalizeCardNumber } from './text'
import type { CardLanguage, PsaLabel } from './types'

/**
 * PSA's language token sits at the end of the first label row, right after the
 * set/era code — `2024 POKEMON TEF EN`, `2022 POKEMON JPN. SV-P`, `2025 POKEMON SVP IT`.
 * An absent token means English.
 */
const LANGUAGE_TOKENS: Array<{ pattern: RegExp; language: CardLanguage | 'other' }> = [
  { pattern: /\b(?:JPN\.?|JP|JAPANESE)\b/i, language: 'japanese' },
  { pattern: /\b(?:EN|ENG|ENGLISH)\b/i, language: 'english' },
  {
    pattern:
      /\b(?:IT|ITA|ITALIAN|GER|DE|GERMAN|FR|FRE|FRENCH|SP|ES|SPANISH|POR|PT|KOR|KO|KOREAN|CHI|CN|CHINESE|RU|RUSSIAN|PL|POLISH|NL|DUTCH|TH|THAI|ID)\b/i,
    language: 'other'
  }
]

/** Row 3 (and sometimes row 2) carries the variety; these two change which Cardmarket rows to price against. */
const REVERSE_HOLO = /\bREV(?:ERSE)?\.?\s*(?:FOIL|HOLO)?\b/i
const FIRST_EDITION = /\b1ST\s*ED(?:ITION)?\.?\b|\bFIRST\s+EDITION\b/i

/** PSA writes the grade as a word on row 2 and the number on row 3. */
const GRADE_WORD = /\b(?:GEM\s*MT|GEM\s*MINT|MINT|NM-?MT|EX-?MT|VG-?EX|VG|GOOD|PR)\b/gi

/**
 * PSA does not always put the language on row 1. On older slabs it is spelled out in
 * full on the variety row instead — `2014 POKEMON XY / M VENUSAUR EX / ITALIAN` — and
 * reading only row 1 there leaves no token at all, which the caller then takes for the
 * unmarked English default. Full words are unambiguous wherever they are printed, so
 * they are searched across the whole label; the two-letter codes stay on row 1, where
 * `IT` and `DE` cannot collide with an ordinary word.
 */
const LANGUAGE_WORDS: Array<{ pattern: RegExp; language: CardLanguage | 'other' }> = [
  {
    pattern: /\b(?:ITALIAN|GERMAN|FRENCH|SPANISH|PORTUGUESE|KOREAN|CHINESE|RUSSIAN|POLISH|DUTCH|THAI|INDONESIAN)\b/i,
    language: 'other'
  },
  { pattern: /\bJAPANESE\b/i, language: 'japanese' },
  { pattern: /\bENGLISH\b/i, language: 'english' }
]

export function psaLabelLanguage(
  setLine: string | null,
  ...otherRows: Array<string | null>
): { language: CardLanguage | 'other' | null; token: string | null } {
  const rows = [setLine, ...otherRows].filter((row): row is string => Boolean(row))
  if (rows.length === 0) {
    return { language: null, token: null }
  }

  // Strip the brand so `POKEMON` can never be read as a language token.
  const strip = (row: string) => row.replace(/\bPOKE?MON\b/gi, ' ').replace(/\bP\.?\s*M\.?\b/g, ' ')
  const whole = rows.map(strip).join(' ')

  // A language we do not buy, named in full anywhere on the slab, settles it: PSA never
  // prints `ITALIAN` on an English card, and guessing English is what costs us money.
  const foreign = LANGUAGE_WORDS[0]!
  const foreignToken = whole.match(foreign.pattern)?.[0]
  if (foreignToken) {
    return { language: foreign.language, token: foreignToken }
  }

  if (setLine) {
    const line = strip(setLine)
    for (const { pattern, language } of LANGUAGE_TOKENS) {
      const token = line.match(pattern)?.[0]
      if (token) {
        return { language, token }
      }
    }
  }

  for (const { pattern, language } of LANGUAGE_WORDS) {
    const token = whole.match(pattern)?.[0]
    if (token) {
      return { language, token }
    }
  }

  return { language: null, token: null }
}

/**
 * PSA prints a real word on every row that carries text, so a row without one is not
 * label text at all — it is the slab's printed border, a barcode fragment, or half a
 * clipped word that OCR handed back on a line of its own.
 */
export function looksLikeLabelText(row: string | null | undefined): boolean {
  return row != null && /[A-Za-z]{3,}/.test(row)
}

function clean(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text : null
}

/** The card name PSA prints, minus the variety prefixes it glues on (`FA/`, `REV.FOIL`). */
export function psaCardName(row: string | null): string | null {
  if (!row) {
    return null
  }

  return clean(
    row
      .replace(GRADE_WORD, ' ')
      .replace(/^(?:FA|SIR|SAR|AR|UR|HR|CHR|RR)\s*\//i, ' ')
      .replace(/\bREV\.?\s*FOIL\b/gi, ' ')
      .replace(/[-–]\s*REV\.?\s*FOIL\b/gi, ' ')
  )
}

/** The set/era code PSA prints on row 1 after the year and brand. */
export function psaSetCode(setLine: string | null): string | null {
  if (!setLine) {
    return null
  }

  const withoutYear = setLine.replace(/\b(?:19|20)\d{2}\b/g, ' ')
  const withoutBrand = withoutYear.replace(/\bPOKE?MON\b/gi, ' ').replace(/\bP\.?\s*M\.?\b/g, ' ')
  const withoutLanguage = withoutBrand.replace(/\b(?:JPN\.?|JP|EN|ENG|IT|ITA|GER|DE|FR|SP|ES|POR|PT|KOR|CHI|CN|RU|PL|NL)\b/gi, ' ')
  return clean(withoutLanguage)
}

/**
 * The slab's printed borders come back from OCR as lone `I`s and stray punctuation
 * sitting between the real words — `POKEMON I JTG EN`, `I I N'S RESHIRAM`. No PSA row
 * is ever a single letter on its own, so dropping those tokens costs nothing and stops
 * two readings of one slab from looking like two different cards.
 */
function stripStrayMarks(value: string | null): string | null {
  if (!value) {
    return null
  }
  return clean(value.replace(/(?:^|\s)(?:I|['’.·:;,]+)(?=\s|$)/g, ' '))
}

type RawLabel = Partial<Record<keyof PsaLabel, unknown>>

/** Turn whatever the label reader returned into a clean, trustworthy PsaLabel. */
export function normalizePsaLabel(raw: RawLabel): PsaLabel {
  const setLine = stripStrayMarks(typeof raw.setLine === 'string' ? raw.setLine : null)
  const varietyLine = stripStrayMarks(typeof raw.varietyLine === 'string' ? raw.varietyLine : null)
  const cardName = stripStrayMarks(psaCardName(typeof raw.cardName === 'string' ? raw.cardName : null))
  const blob = [setLine, varietyLine, typeof raw.cardName === 'string' ? raw.cardName : null].filter(Boolean).join(' ')

  const fromLine = psaLabelLanguage(setLine, varietyLine, cardName)
  const declared = typeof raw.language === 'string' ? raw.language.toLowerCase() : null
  const language =
    declared === 'english' || declared === 'japanese' || declared === 'other'
      ? (declared as CardLanguage | 'other')
      : (fromLine.language ?? (setLine ? 'english' : null))

  const grade = raw.grade == null || raw.grade === '' ? null : Number(raw.grade)
  const cert = clean(typeof raw.certNumber === 'string' ? raw.certNumber : null)?.replace(/\D/g, '') ?? null

  return {
    certNumber: cert && cert.length >= 7 && cert.length <= 10 ? cert : null,
    year: clean(typeof raw.year === 'string' ? raw.year : null),
    setLine,
    cardName,
    varietyLine,
    cardNumber: normalizeCardNumber(clean(typeof raw.cardNumber === 'string' ? raw.cardNumber : null)),
    language,
    languageLabel: fromLine.token ?? (typeof raw.languageLabel === 'string' ? clean(raw.languageLabel) : null),
    grade: grade != null && Number.isFinite(grade) ? grade : null,
    reverseHolo: raw.reverseHolo === true || REVERSE_HOLO.test(blob),
    firstEdition: raw.firstEdition === true || FIRST_EDITION.test(blob)
  }
}

/** One-line summary of the label for the dashboard. */
export function describePsaLabel(label: PsaLabel): string {
  const parts = [label.year, label.setLine, label.cardName, label.varietyLine].filter(Boolean)
  const number = label.cardNumber ? `#${label.cardNumber}` : null
  const grade = label.grade != null ? `PSA ${label.grade}` : null
  return [...parts, number, grade].filter(Boolean).join(' · ')
}
