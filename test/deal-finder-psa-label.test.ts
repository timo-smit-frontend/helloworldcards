import { describe, expect, it } from 'vitest'
import { certToLabel, parseCertGrade, psaCertLookup } from '~/services/deal-finder/psa-cert'
import { describePsaLabel, normalizePsaLabel, psaCardName, psaLabelLanguage, psaSetCode } from '~/services/deal-finder/psa-label'

describe('psaLabelLanguage', () => {
  it('reads the language token off the first label row', () => {
    expect(psaLabelLanguage('POKEMON TEF EN')).toEqual({ language: 'english', token: 'EN' })
    expect(psaLabelLanguage('POKEMON JPN. SV-P').language).toBe('japanese')
    expect(psaLabelLanguage('POKEMON M2a JP').language).toBe('japanese')
    expect(psaLabelLanguage('POKEMON SVP IT')).toEqual({ language: 'other', token: 'IT' })
  })

  it('never reads the brand as a language', () => {
    expect(psaLabelLanguage('POKEMON SWSH BSP')).toEqual({ language: null, token: null })
  })
})

describe('psaSetCode', () => {
  it('keeps the set code and drops the year, brand and language', () => {
    expect(psaSetCode('2021 POKEMON SWSH BSP')).toBe('SWSH BSP')
    expect(psaSetCode('2025 POKEMON M2a JP')).toBe('M2a')
    expect(psaSetCode('2024 POKEMON TEF EN')).toBe('TEF')
  })
})

describe('psaCardName', () => {
  it('drops the variety prefix and the grade word PSA prints on the same row', () => {
    expect(psaCardName('FA/PIKACHU V MINT')).toBe('PIKACHU V')
    expect(psaCardName("N'S RESHIRAM GEM MT")).toBe("N'S RESHIRAM")
    expect(psaCardName('MEWTWO-REV.FOIL')).toBe('MEWTWO-')
  })
})

describe('normalizePsaLabel', () => {
  it('fills in the language from the first row when the reader did not say', () => {
    const label = normalizePsaLabel({
      setLine: 'POKEMON JPN. SV-P',
      cardName: 'PIKACHU GEM MT',
      varietyLine: 'SCARLET/VIOLET PRE-ORDER',
      cardNumber: '001',
      certNumber: '161108283',
      grade: 10
    })

    expect(label.language).toBe('japanese')
    expect(label.cardName).toBe('PIKACHU')
    expect(label.certNumber).toBe('161108283')
  })

  it('treats an unlabelled row as English', () => {
    expect(normalizePsaLabel({ setLine: 'POKEMON SWSH BSP', grade: 9 }).language).toBe('english')
  })

  it('rejects a certification number that is not 7 to 10 digits', () => {
    expect(normalizePsaLabel({ certNumber: '123' }).certNumber).toBeNull()
    expect(normalizePsaLabel({ certNumber: '83908784' }).certNumber).toBe('83908784')
  })

  it('picks up reverse holo and 1st edition wherever they are printed', () => {
    expect(normalizePsaLabel({ cardName: 'MEWTWO-REV.FOIL', setLine: 'POKEMON XY' }).reverseHolo).toBe(true)
    expect(normalizePsaLabel({ varietyLine: '1ST EDITION', setLine: 'POKEMON BASE SET' }).firstEdition).toBe(true)
  })

  it('takes the numerator when the number is printed as a fraction', () => {
    expect(normalizePsaLabel({ cardNumber: '015/113' }).cardNumber).toBe('015')
  })
})

describe('describePsaLabel', () => {
  it('reads back as the label does', () => {
    const label = normalizePsaLabel({
      year: '2021',
      setLine: 'POKEMON SWSH BSP',
      cardName: 'FA/PIKACHU V',
      varietyLine: 'CLBRTNS.ULTRA-PREM.COLL',
      cardNumber: '145',
      grade: 9
    })
    expect(describePsaLabel(label)).toBe('2021 · POKEMON SWSH BSP · PIKACHU V · CLBRTNS.ULTRA-PREM.COLL · #145 · PSA 9')
  })
})

describe('PSA cert lookup', () => {
  const payload = {
    PSACert: {
      CertNumber: '22043326',
      Year: '2016',
      Brand: 'POKEMON XY EVOLUTIONS',
      CardNumber: '51',
      Subject: 'MEWTWO',
      Variety: 'REV.FOIL',
      GradeDescription: 'MINT 9',
      CardGrade: '9'
    }
  }

  it('turns PSA records into a label', () => {
    const label = certToLabel(payload)

    expect(label).toMatchObject({
      certNumber: '22043326',
      year: '2016',
      cardName: 'MEWTWO',
      cardNumber: '51',
      grade: 9,
      reverseHolo: true,
      language: 'english'
    })
  })

  it('reads the grade out of the grade description', () => {
    expect(parseCertGrade('GEM MT 10')).toBe(10)
    expect(parseCertGrade('MINT 9')).toBe(9)
    expect(parseCertGrade(null)).toBeNull()
  })

  it('only calls PSA for a plausible certification number', () => {
    const calls: string[] = []
    const lookup = psaCertLookup({
      token: 'test-token',
      fetchJson: async (url) => {
        calls.push(url)
        return payload
      }
    })

    return Promise.all([lookup('12'), lookup('22043326')]).then(([bad, good]) => {
      expect(bad).toBeNull()
      expect(good?.cardName).toBe('MEWTWO')
      expect(calls).toEqual(['https://api.psacard.com/publicapi/cert/GetByCertNumber/22043326'])
    })
  })
})
