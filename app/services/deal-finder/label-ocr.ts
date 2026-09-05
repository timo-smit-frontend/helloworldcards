import { normalizePsaLabel } from './psa-label'
import type { PsaLabel } from './types'

/**
 * One line of text as an OCR engine saw it. This is deliberately the smallest
 * shape Tesseract can give us, so the parsing below stays testable without
 * running an OCR engine or holding a photo in memory.
 */
export type OcrLine = {
  text: string
  /** 0-100, as Tesseract reports it. */
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * A slab is only ever picked up from row 1, so that line has to be recognised
 * confidently; the rows under it may be blurrier without costing us the card.
 */
const MIN_ANCHOR_CONFIDENCE = 45
/** A wrong digit here means we would price a completely different card. */
const MIN_CERT_CONFIDENCE = 60

const YEAR = /\b(?:19|20)\d{2}\b/
/** `POKEMON` through a phone camera: the O's turn into zeros and the M into an N. */
const BRAND = /\bP[O0Q]KE?[MN][O0Q]N\b/
const CERT = /\d{8,9}/
/** PSA writes the grade word on row 2; the mapping to a number is fixed. */
const GRADE_WORDS: Array<{ pattern: RegExp; grade: number }> = [
  { pattern: /\bGEM\s*-?\s*M(?:T|INT)\b/, grade: 10 },
  { pattern: /\bNM\s*-?\s*MT\b/, grade: 8 },
  { pattern: /\bMINT\b/, grade: 9 },
  { pattern: /\bEX\s*-?\s*MT\b/, grade: 6 }
]

/**
 * PSA prints the card number, the grade word and the numeric grade in a right-hand
 * column, separated from the row text by enough white space that OCR reports them
 * as lines of their own. Only these three shapes ever appear there, which is what
 * makes them safe to glue back on: a second slab in the same photo starts with a
 * year and a brand, so it can never be mistaken for a stray column fragment.
 */
const RIGHT_COLUMN =
  /^(?:#\s*[A-Z]{0,3}\s?\d{1,4}[A-Z]?|(?:GEM\s*-?\s*M(?:T|INT)|MINT|NM\s*-?\s*MT|EX\s*-?\s*MT|VG\s*-?\s*EX|VG|GOOD|PR)|(?:10|[1-9])(?:\.5)?)$/

function normalizeText(value: string): string {
  return value
    .replace(/[’‘`´]/g, "'")
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Two lines belong to the same printed row when their vertical spans mostly coincide. */
function sameRow(row: OcrLine, fragment: OcrLine): boolean {
  const overlap = Math.min(row.bbox.y1, fragment.bbox.y1) - Math.max(row.bbox.y0, fragment.bbox.y0)
  return overlap > Math.min(height(row), height(fragment)) * 0.5
}

/** Glue every right-column fragment back onto the row it was printed on. */
function assembleRows(lines: OcrLine[]): OcrLine[] {
  const fragments = lines.filter((line) => RIGHT_COLUMN.test(line.text))
  const rows = lines.filter((line) => !fragments.includes(line)).map((line) => ({ ...line, bbox: { ...line.bbox } }))

  for (const fragment of fragments) {
    // With two slabs side by side, the fragment belongs to the row it sits closest behind.
    const row = rows
      .filter((candidate) => sameRow(candidate, fragment) && candidate.bbox.x1 <= fragment.bbox.x0)
      .sort((a, b) => b.bbox.x1 - a.bbox.x1)[0]

    if (row) {
      row.text = `${row.text} ${fragment.text}`
      row.bbox.x1 = Math.max(row.bbox.x1, fragment.bbox.x1)
      row.confidence = Math.min(row.confidence, fragment.confidence)
    } else {
      rows.push(fragment)
    }
  }

  return rows
}

function height(line: OcrLine): number {
  return Math.max(1, line.bbox.y1 - line.bbox.y0)
}

function centerX(line: OcrLine): number {
  return (line.bbox.x0 + line.bbox.x1) / 2
}

/**
 * The three label rows sit directly under each other in a band no wider than the
 * first row, so a line qualifies as a following row when it starts below row 1
 * and its middle stays inside that band.
 */
function rowsUnder(anchor: OcrLine, lines: OcrLine[]): OcrLine[] {
  const h = height(anchor)
  const width = Math.max(1, anchor.bbox.x1 - anchor.bbox.x0)
  const left = anchor.bbox.x0 - width * 0.4
  const right = anchor.bbox.x1 + width * 0.4

  return lines
    .filter((line) => line !== anchor)
    .filter((line) => line.bbox.y0 > anchor.bbox.y0 + h * 0.4 && line.bbox.y0 < anchor.bbox.y0 + h * 6)
    .filter((line) => centerX(line) >= left && centerX(line) <= right)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0)
}

/** The certification number is printed under the barcode, at the foot of the same label. */
function certUnder(anchor: OcrLine, lines: OcrLine[]): string | null {
  const h = height(anchor)
  const width = Math.max(1, anchor.bbox.x1 - anchor.bbox.x0)

  const candidates = lines
    .filter((line) => line.confidence >= MIN_CERT_CONFIDENCE)
    .filter((line) => line.bbox.y0 > anchor.bbox.y0 && line.bbox.y0 < anchor.bbox.y0 + h * 14)
    .filter((line) => centerX(line) >= anchor.bbox.x0 - width * 0.6 && centerX(line) <= anchor.bbox.x1 + width * 0.6)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0)

  for (const line of candidates) {
    // A digit run flanked by more digits is not a cert number, it is a misread barcode.
    const match = normalizeText(line.text).match(new RegExp(`(?<!\\d)${CERT.source}(?!\\d)`))
    if (match) {
      return match[0]
    }
  }

  return null
}

/** `2021 POKEMON SWSH BSP #145` → `{ year, setLine: 'POKEMON SWSH BSP', cardNumber: '145' }` */
function parseFirstRow(text: string): { year: string | null; setLine: string | null; cardNumber: string | null } {
  const year = text.match(YEAR)?.[0] ?? null
  const cardNumber = text.match(/#\s*([A-Z]{0,3}\s?\d{1,4}[A-Z]?)/)?.[1]?.replace(/\s+/g, '') ?? null
  const setLine = text.replace(/#.*$/, ' ').replace(YEAR, ' ').replace(/\s+/g, ' ').trim() || null

  return { year, setLine: setLine ? `POKEMON ${setLine.replace(BRAND, ' ').replace(/\s+/g, ' ').trim()}`.trim() : null, cardNumber }
}

function gradeFromWord(text: string): number | null {
  for (const { pattern, grade } of GRADE_WORDS) {
    if (pattern.test(text)) {
      return grade
    }
  }
  return null
}

/** The numeric grade is printed at the right-hand end of row 3, on its own. */
function gradeFromRow(text: string): number | null {
  const match = text.match(/(?:^|\s)(10|[1-9])(?:\.5)?\s*$/)
  return match ? Number(match[1]) : null
}

function stripTrailingGrade(text: string): string {
  return text.replace(/(?:^|\s)(?:10|[1-9])(?:\.5)?\s*$/, '').trim()
}

export type LabelOcrResult = { slabs: PsaLabel[]; note: string | null }

/**
 * Turn the lines an OCR pass produced into the PSA labels they describe.
 *
 * Row 1 (`YEAR POKEMON <set> <language> #<number>`) is the only line distinctive
 * enough to find without knowing the card, so every slab is anchored on it and
 * the remaining rows are read out of the band directly underneath.
 */
export function parsePsaLabels(lines: OcrLine[]): LabelOcrResult {
  const usable = assembleRows(lines.map((line) => ({ ...line, text: normalizeText(line.text) })).filter((line) => line.text.length > 0))

  const anchors = usable.filter((line) => line.confidence >= MIN_ANCHOR_CONFIDENCE && YEAR.test(line.text) && BRAND.test(line.text))

  if (anchors.length === 0) {
    const sawBrand = usable.some((line) => BRAND.test(line.text))
    return {
      slabs: [],
      note: sawBrand ? 'Read Pokémon text but no PSA label row in the photos.' : 'No PSA label text found in the photos.'
    }
  }

  const slabs = anchors.map((anchor) => {
    const rows = rowsUnder(anchor, usable)
    const first = parseFirstRow(anchor.text)
    const nameRow = rows[0]?.text ?? null
    const varietyRow = rows[1]?.text ?? null

    return normalizePsaLabel({
      certNumber: certUnder(anchor, usable),
      year: first.year,
      setLine: first.setLine,
      cardName: nameRow,
      varietyLine: varietyRow ? stripTrailingGrade(varietyRow) : null,
      cardNumber: first.cardNumber,
      grade:
        (varietyRow ? gradeFromRow(varietyRow) : null) ??
        (nameRow ? gradeFromWord(nameRow) : null) ??
        (varietyRow ? gradeFromWord(varietyRow) : null)
    })
  })

  const merged = mergeSlabs(slabs)
  return {
    slabs: merged,
    note: merged.some((slab) => slab.cardName) ? null : 'Found a PSA label but could not read the card name off it.'
  }
}

function sameSlab(a: PsaLabel, b: PsaLabel): boolean {
  if (a.certNumber && b.certNumber) {
    return a.certNumber === b.certNumber
  }
  if (a.cardName && b.cardName) {
    return a.cardName === b.cardName
  }
  // One of the two told us nothing identifying, so it cannot contradict the other.
  return true
}

function pick<T>(preferred: T | null, fallback: T | null): T | null {
  return preferred ?? fallback
}

/** Two readings of the same slab fill each other's gaps; the one with a cert number leads. */
function combine(a: PsaLabel, b: PsaLabel): PsaLabel {
  const [lead, other] = a.certNumber || !b.certNumber ? [a, b] : [b, a]
  return {
    certNumber: pick(lead.certNumber, other.certNumber),
    year: pick(lead.year, other.year),
    setLine: pick(lead.setLine, other.setLine),
    cardName: pick(lead.cardName, other.cardName),
    varietyLine: pick(lead.varietyLine, other.varietyLine),
    cardNumber: pick(lead.cardNumber, other.cardNumber),
    language: pick(lead.language, other.language),
    languageLabel: pick(lead.languageLabel, other.languageLabel),
    grade: pick(lead.grade, other.grade),
    reverseHolo: lead.reverseHolo || other.reverseHolo,
    firstEdition: lead.firstEdition || other.firstEdition
  }
}

/**
 * Collapse readings that describe the same slab.
 *
 * A listing with two slabs is deliberately reported as a problem rather than
 * priced, so noise must never look like a second card: readings only stay apart
 * when they name different cert numbers or different cards outright.
 */
export function mergeSlabs(slabs: PsaLabel[]): PsaLabel[] {
  const merged: PsaLabel[] = []

  for (const slab of slabs) {
    const index = merged.findIndex((existing) => sameSlab(existing, slab))
    if (index === -1) {
      merged.push(slab)
    } else {
      merged[index] = combine(merged[index]!, slab)
    }
  }

  return merged
}

/** Fold the per-photo readings of one listing into a single answer. */
export function mergeReadings(results: LabelOcrResult[]): LabelOcrResult {
  const slabs = mergeSlabs(results.flatMap((result) => result.slabs))
  if (slabs.length > 0) {
    return { slabs, note: results.find((result) => result.slabs.length > 0)?.note ?? null }
  }
  return { slabs: [], note: results[0]?.note ?? 'No usable photos on the listing.' }
}
