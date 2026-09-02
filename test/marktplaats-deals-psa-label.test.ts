import { describe, expect, it } from 'vitest'
import {
  buildGoogleCardmarketQuery,
  extractCardNumberFromOcr,
  inferSetCodeFromLabelRows,
  parsePsaLabelOcr
} from '~/services/marktplaats-deals/psa-label'

const mewtwoOcr = `
2016 POKEMON XY #51
MEWTWO-REV.FOIL MINT
EVOLUTIONS 9

UT = = 148651617
`

const vaporeonOcr = `
2021 POKEMON SWSH B FA/VAPOREON VMAX
VAPOREON VMAX PREM.COLL
`

const dewgongOcr = `
om i, 2025 POKEMON PFL EN #097 § > SITE es
= II), DEWGONG MINT ee
—. | |) ILLUSTRATION RARE 9 || Regu ee
: ss. } | “ ~ ee cs 4

sey) MLL z 151034319 (0 )) teens
`

const zekromOcr = `
2019 P.M. JPN. SUN & MOON #041
PIKACHU & ZEKROM GX
TAG TEAM GX ALL STARS
MINT 9
122202601
`

describe('parsePsaLabelOcr', () => {
  it('reads the three left rows and top-right number from a PSA label', () => {
    expect(parsePsaLabelOcr(mewtwoOcr)).toEqual({
      rows: ['2016 POKEMON XY', 'MEWTWO-REV.FOIL', 'EVOLUTIONS'],
      cardNumber: '51',
      reverseHolo: true,
      japanese: false,
      unsupportedLanguage: false
    })
  })

  it('parses premium collection labels like any other PSA label', () => {
    expect(parsePsaLabelOcr(vaporeonOcr)).toMatchObject({
      rows: ['2021 POKEMON SWSH B FA/VAPOREON VMAX', 'VAPOREON VMAX PREM.COLL'],
      cardNumber: null,
      reverseHolo: false,
      japanese: false,
      unsupportedLanguage: false
    })
    expect(inferSetCodeFromLabelRows(parsePsaLabelOcr(vaporeonOcr)!.rows)).toBe('SWSH')
  })

  it('reads fraction card numbers from the label', () => {
    expect(
      parsePsaLabelOcr(`
2023 POKEMON SV #015/113
CHANSEY
151 9
`)
    ).toMatchObject({
      rows: ['2023 POKEMON SV', 'CHANSEY', '151'],
      cardNumber: '015',
      unsupportedLanguage: false
    })
  })

  it('reads noisy English Dewgong label OCR including #097', () => {
    expect(parsePsaLabelOcr(dewgongOcr)).toMatchObject({
      cardNumber: '097',
      japanese: false,
      unsupportedLanguage: false
    })
    expect(parsePsaLabelOcr(dewgongOcr)?.rows.join(' ')).toMatch(/POKEMON PFL EN/i)
    expect(parsePsaLabelOcr(dewgongOcr)?.rows.join(' ')).toMatch(/DEWGONG/i)
  })

  it('reads Japanese P.M. labels for Tag Team cards', () => {
    expect(parsePsaLabelOcr(zekromOcr)).toMatchObject({
      rows: ['2019 P.M. JPN. SUN & MOON', 'PIKACHU & ZEKROM GX', 'TAG TEAM GX ALL STARS'],
      cardNumber: '041',
      japanese: true,
      unsupportedLanguage: false
    })
  })

  it('rejects OCR without a PSA label shape', () => {
    expect(parsePsaLabelOcr('unreadable slab photo')).toBeNull()
  })

  it('flags German and other non EN/JP PSA labels', () => {
    expect(
      parsePsaLabelOcr(`
2022 POKEMON SWSH GERMAN #124
STAHLOS
VERLORENER URSPRUNG 9
`)
    ).toMatchObject({
      unsupportedLanguage: true
    })
  })
})

describe('extractCardNumberFromOcr', () => {
  it('finds #097 and face-print fractions in noisy OCR', () => {
    expect(extractCardNumberFromOcr(dewgongOcr)).toBe('097')
    expect(extractCardNumberFromOcr('©) o41/17308')).toBe('41')
  })
})

describe('buildGoogleCardmarketQuery', () => {
  it('uses only the three label rows, #number, and cardmarket', () => {
    expect(
      buildGoogleCardmarketQuery({
        rows: ['2016 POKEMON XY', 'MEWTWO-REV.FOIL', 'EVOLUTIONS'],
        cardNumber: '51',
        reverseHolo: true,
        japanese: false,
        unsupportedLanguage: false
      })
    ).toBe('2016 POKEMON XY MEWTWO-REV.FOIL EVOLUTIONS #51 cardmarket')
  })

  it('keeps PREM.COLL on the parsed label but drops it from the Google query', () => {
    const label = parsePsaLabelOcr(`
2021 POKEMON SWSH BSP #182
FA/VAPOREON VMAX MINT
VAPOREON VMAX PREM.COLL
`)!
    expect(label.rows[2]).toMatch(/PREM\.COLL/i)
    expect(buildGoogleCardmarketQuery(label)).toBe(
      '2021 POKEMON SWSH BSP VAPOREON VMAX VAPOREON VMAX #182 cardmarket'
    )
  })

  it('strips glare crumbs and leading junk before the year', () => {
    expect(
      buildGoogleCardmarketQuery({
        rows: ['a 2021 POKEMON SWSH BSP 4 i 3', 'FA/VAPOREON VMAX B', 'VAPOREON VMAX PREM.COLL. 5718'],
        cardNumber: '182',
        reverseHolo: false,
        japanese: false,
        unsupportedLanguage: false
      })
    ).toBe('2021 POKEMON SWSH BSP VAPOREON VMAX VAPOREON VMAX #182 cardmarket')
  })

  it('repairs OCR #ii2 into #112 and skips Italian language labels', () => {
    expect(extractCardNumberFromOcr('#ii2\n2026 POKEMON MEP JP')).toBe('112')
    expect(
      parsePsaLabelOcr(`
2025 POKEMON DRI IT #234
ROCKET'S CROBAT ex GEM MT
SPECIAL ILLUSTRATION RARE 10
`)
    ).toMatchObject({ unsupportedLanguage: true })
  })
})
