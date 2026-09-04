import { describePsaLabel, psaSetCode } from './psa-label'
import {
  detectCardName,
  detectCardNumber,
  detectGrade,
  detectLanguage,
  detectSet,
  isFirstEdition,
  isJapaneseSetCode,
  isReverseHolo
} from './text'
import type { CardIdentity, CardLanguage, IdentitySignal, PsaGrade, PsaLabel, SourceListing } from './types'

export type IdentityResult =
  | { ok: true; identity: CardIdentity; label: PsaLabel | null; note: string | null }
  /** `out-of-scope` is a card we deliberately do not buy; `problem` is one we could not read. */
  | { ok: false; scope: 'out-of-scope' | 'problem'; reason: string; detail: string | null }

export function listingText(listing: Pick<SourceListing, 'title' | 'description'>): string {
  return [listing.title, listing.description].filter(Boolean).join('\n')
}

function isSupportedGrade(grade: number | null): grade is PsaGrade {
  return grade === 9 || grade === 10
}

/**
 * Merge everything we know about a listing into one card identity.
 *
 * The PSA label wins wherever it is readable — it is the physical card in the
 * photo — and the seller's own words fill the gaps. When the two disagree about
 * something that changes the price (grade, language) we stop rather than guess.
 */
export function identifyCard({
  listing,
  slabs,
  cert,
  readerNote
}: {
  listing: SourceListing
  /** Every PSA label the reader found across the listing photos. */
  slabs: PsaLabel[]
  /** Authoritative record from PSA's cert lookup, when the cert number was readable. */
  cert: PsaLabel | null
  readerNote: string | null
}): IdentityResult {
  const text = listingText(listing)
  const titleGrade = detectGrade(text)

  if (slabs.length > 1) {
    return {
      ok: false,
      scope: 'problem',
      reason: `${slabs.length} graded cards in one listing`,
      detail: slabs.map(describePsaLabel).join(' | ')
    }
  }

  const label = cert ?? slabs[0] ?? null
  const signals: IdentitySignal[] = []
  if (listing.title) {
    signals.push('title')
  }
  if (listing.description) {
    signals.push('description')
  }
  if (slabs[0]) {
    signals.push('psa-label')
  }
  if (cert) {
    signals.push('psa-cert')
  }

  const grade = isSupportedGrade(label?.grade ?? null) ? (label!.grade as PsaGrade) : titleGrade
  if (!isSupportedGrade(grade)) {
    const seen = label?.grade ?? titleGrade
    return {
      ok: false,
      scope: 'out-of-scope',
      reason: seen != null ? `Graded PSA ${seen}, not 9 or 10` : 'No PSA 9 or 10 grade found',
      detail: label ? describePsaLabel(label) : null
    }
  }

  if (label?.grade != null && titleGrade != null && label.grade !== titleGrade) {
    return {
      ok: false,
      scope: 'problem',
      reason: `Listing says PSA ${titleGrade} but the slab reads PSA ${label.grade}`,
      detail: describePsaLabel(label)
    }
  }

  const set = detectSet(text)
  const textLanguage = detectLanguage(text)

  if (label?.language === 'other') {
    return {
      ok: false,
      scope: 'out-of-scope',
      reason: `PSA label says ${label.languageLabel ?? 'another language'} — we only buy English and Japanese`,
      detail: describePsaLabel(label)
    }
  }

  if (!label && textLanguage === 'other') {
    return {
      ok: false,
      scope: 'out-of-scope',
      reason: 'Listing says the card is not English or Japanese',
      detail: null
    }
  }

  const language: CardLanguage =
    (label?.language === 'english' || label?.language === 'japanese' ? label.language : null) ??
    (textLanguage === 'japanese' ? 'japanese' : null) ??
    (isJapaneseSetCode(set.code) ? 'japanese' : 'english')

  // Sellers put the card in the title and everything else in the description, so the
  // number and the name are read from the title first. The description only gets to
  // contribute a number it states outright — a bare digit in Dutch prose is a grade,
  // a year or a price far more often than it is a card number.
  const titleSet = detectSet(listing.title)
  const cardNumber =
    label?.cardNumber ??
    detectCardNumber(listing.title, titleSet.matched) ??
    detectCardNumber(listing.description ?? '', set.matched, { allowBare: false })
  const setCode = psaSetCode(label?.setLine ?? null) ?? set.code
  // The set code beats the label's variety row — "MEW" identifies the set, "ILLUSTRATION RARE" does not.
  const setName = set.name ?? setCode ?? label?.varietyLine ?? null
  const name = label?.cardName ?? detectCardName(listing.title, titleSet.matched, cardNumber)

  if (!name) {
    return { ok: false, scope: 'problem', reason: 'Could not work out which card this is', detail: readerNote }
  }

  if (!cardNumber && !setCode) {
    return {
      ok: false,
      scope: 'problem',
      reason: 'No card number or set on the listing or the slab',
      detail: readerNote ?? (label ? describePsaLabel(label) : null)
    }
  }

  return {
    ok: true,
    label,
    note: readerNote,
    identity: {
      name,
      cardNumber,
      setName,
      setCode,
      language,
      grade,
      reverseHolo: label?.reverseHolo ?? isReverseHolo(text),
      firstEdition: label?.firstEdition ?? isFirstEdition(text),
      certNumber: label?.certNumber ?? null,
      signals,
      confidence: label ? 'high' : 'medium'
    }
  }
}

/** `Charizard ex (PAF 234) EN — PSA 10` */
export function displayTitle(identity: CardIdentity): string {
  const set = [identity.setName, identity.cardNumber].filter(Boolean).join(' ')
  const language = identity.language === 'japanese' ? 'JP' : 'EN'
  return `${identity.name}${set ? ` (${set})` : ''} ${language} — PSA ${identity.grade}`
}
