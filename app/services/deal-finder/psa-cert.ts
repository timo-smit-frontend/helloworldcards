import { normalizeCardNumber } from './text'
import { psaLabelLanguage } from './psa-label'
import type { PsaLabel } from './types'

const CERT_ENDPOINT = 'https://api.psacard.com/publicapi/cert/GetByCertNumber'

export type PsaCertLookup = (certNumber: string) => Promise<PsaLabel | null>

/** PSA's JSON uses PascalCase, but has shifted casing before — read it either way. */
function field(record: Record<string, unknown>, ...names: string[]): string | null {
  for (const name of names) {
    const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
    const value = key ? record[key] : undefined
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number') {
      return String(value)
    }
  }
  return null
}

/** `MINT 9` / `GEM MT 10` → 9 / 10 */
export function parseCertGrade(description: string | null): number | null {
  const match = description?.match(/(\d{1,2})(?:\.\d)?\s*$/)
  return match ? Number(match[1]) : null
}

export function certToLabel(payload: unknown): PsaLabel | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const root = payload as Record<string, unknown>
  const certKey = Object.keys(root).find((key) => key.toLowerCase() === 'psacert')
  const record = (certKey ? root[certKey] : root) as Record<string, unknown> | undefined
  if (!record || typeof record !== 'object') {
    return null
  }

  const brand = field(record, 'Brand')
  const subject = field(record, 'Subject')
  const variety = field(record, 'Variety')
  const year = field(record, 'Year')
  if (!brand && !subject) {
    return null
  }

  const setLine = [year, brand].filter(Boolean).join(' ')
  const { language, token } = psaLabelLanguage(setLine)
  const blob = `${brand ?? ''} ${variety ?? ''}`

  return {
    certNumber: field(record, 'CertNumber'),
    year,
    setLine: brand,
    cardName: subject,
    varietyLine: variety,
    cardNumber: normalizeCardNumber(field(record, 'CardNumber')),
    language: language ?? 'english',
    languageLabel: token,
    grade: parseCertGrade(field(record, 'GradeDescription')) ?? (Number(field(record, 'CardGrade')) || null),
    reverseHolo: /\bREV(?:ERSE)?\.?\s*(?:FOIL|HOLO)?\b/i.test(blob),
    firstEdition: /\b1ST\s*ED(?:ITION)?\.?\b/i.test(blob)
  }
}

/**
 * PSA's free public API resolves a certification number to the authoritative card.
 * The free tier allows 100 lookups a day, so it only runs when we actually read a
 * cert number off the slab — and a failure never blocks the scan.
 */
export function psaCertLookup({
  token,
  fetchJson = defaultFetchJson
}: {
  token: string
  fetchJson?: (url: string, token: string) => Promise<unknown>
}): PsaCertLookup {
  return async (certNumber: string) => {
    if (!/^\d{7,10}$/.test(certNumber)) {
      return null
    }
    const payload = await fetchJson(`${CERT_ENDPOINT}/${certNumber}`, token)
    return certToLabel(payload)
  }
}

async function defaultFetchJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      authorization: `bearer ${token}`,
      accept: 'application/json'
    }
  })
  if (!response.ok) {
    throw new Error(`PSA cert lookup failed (${response.status})`)
  }
  return response.json()
}
