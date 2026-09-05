import { describe, expect, it } from 'vitest'
import { mergeReadings, mergeSlabs, parsePsaLabels, type OcrLine } from '~/services/deal-finder/label-ocr'

/** A PSA label as Tesseract sees it: four stacked rows in one narrow column. */
function label(rows: Array<{ text: string; confidence?: number }>, { x = 100, y = 100, width = 400 } = {}): OcrLine[] {
  return rows.map((row, index) => ({
    text: row.text,
    confidence: row.confidence ?? 90,
    bbox: { x0: x, y0: y + index * 30, x1: x + width, y1: y + index * 30 + 24 }
  }))
}

describe('parsePsaLabels', () => {
  it('reads the rows of an English label off the lines under the first row', () => {
    const { slabs, note } = parsePsaLabels(
      label([
        { text: '2024 POKEMON TEF EN #212' },
        { text: 'FA/IRON CROWN ex GEM MT' },
        { text: 'SPECIAL ILLUSTRATION RARE 10' },
        { text: '92847163' }
      ])
    )

    expect(note).toBeNull()
    expect(slabs).toHaveLength(1)
    expect(slabs[0]).toMatchObject({
      certNumber: '92847163',
      year: '2024',
      cardName: 'IRON CROWN EX',
      varietyLine: 'SPECIAL ILLUSTRATION RARE',
      cardNumber: '212',
      language: 'english',
      grade: 10
    })
  })

  it('keeps the Japanese language token PSA prints on the first row', () => {
    const { slabs } = parsePsaLabels(
      label([{ text: '2022 POKEMON JPN. SV-P #001' }, { text: 'PIKACHU MINT' }, { text: 'SCARLET/VIOLET PROMO 9' }, { text: '104928374' }])
    )

    expect(slabs[0]?.language).toBe('japanese')
    expect(slabs[0]?.grade).toBe(9)
  })

  it('falls back to the grade word when the number on row three is lost', () => {
    const { slabs } = parsePsaLabels(
      label([{ text: '2021 POKEMON SWSH BSP #145' }, { text: 'CHARIZARD V GEM MT' }, { text: 'BLACK STAR PROMO' }])
    )

    expect(slabs[0]?.grade).toBe(10)
    expect(slabs[0]?.certNumber).toBeNull()
  })

  it('still anchors on a first row whose brand came through the camera misread', () => {
    const { slabs } = parsePsaLabels(
      label([{ text: '2023 P0KEM0N SVI EN #244' }, { text: 'CHARIZARD ex GEM MT' }, { text: 'SPECIAL ART RARE 10' }])
    )

    expect(slabs[0]?.cardName).toBe('CHARIZARD EX')
  })

  it('ignores rows that belong to a different part of the photo', () => {
    const lines = [
      ...label([{ text: '2024 POKEMON TEF EN #212' }, { text: 'IRON CROWN ex GEM MT' }, { text: 'SPECIAL ART RARE 10' }]),
      // The seller's price sticker, off to the right of the slab.
      { text: '45 EURO', confidence: 90, bbox: { x0: 900, y0: 130, x1: 1100, y1: 154 } }
    ]

    expect(parsePsaLabels(lines).slabs[0]?.cardName).toBe('IRON CROWN EX')
  })

  it('glues the card number and grade back onto the rows they were printed on', () => {
    const rows = label([{ text: '2024 POKEMON TEF EN' }, { text: 'FA/IRON CROWN ex' }, { text: 'SPECIAL ILLUSTRATION RARE' }])
    const rightColumn: OcrLine[] = [
      { text: '#212', confidence: 92, bbox: { x0: 620, y0: 100, x1: 700, y1: 124 } },
      { text: 'GEM MT', confidence: 92, bbox: { x0: 620, y0: 130, x1: 720, y1: 154 } },
      { text: '10', confidence: 92, bbox: { x0: 640, y0: 160, x1: 700, y1: 184 } }
    ]

    expect(parsePsaLabels([...rows, ...rightColumn]).slabs[0]).toMatchObject({
      cardName: 'IRON CROWN EX',
      cardNumber: '212',
      grade: 10
    })
  })

  it('gives each of two slabs the right-column fragment printed behind it', () => {
    const lines = [
      ...label([{ text: '2024 POKEMON TEF EN' }, { text: 'IRON CROWN ex' }, { text: 'SPECIAL ART RARE' }], { x: 100, width: 400 }),
      ...label([{ text: '2021 POKEMON SWSH BSP' }, { text: 'CHARIZARD V' }, { text: 'BLACK STAR PROMO' }], { x: 900, width: 400 }),
      { text: '#212', confidence: 92, bbox: { x0: 520, y0: 100, x1: 590, y1: 124 } },
      { text: '#145', confidence: 92, bbox: { x0: 1320, y0: 100, x1: 1390, y1: 124 } }
    ]

    const slabs = parsePsaLabels(lines).slabs
    expect(slabs).toHaveLength(2)
    expect(slabs.map((slab) => slab.cardNumber)).toEqual(['212', '145'])
  })

  it('refuses a certification number read off a blurry line', () => {
    const { slabs } = parsePsaLabels(
      label([
        { text: '2024 POKEMON TEF EN #212' },
        { text: 'IRON CROWN ex GEM MT' },
        { text: 'SPECIAL ART RARE 10' },
        { text: '92847163', confidence: 41 }
      ])
    )

    expect(slabs[0]?.certNumber).toBeNull()
  })

  it('says so when the photos hold no label at all', () => {
    const { slabs, note } = parsePsaLabels(label([{ text: 'MOOIE KAART IN TOPSTAAT' }, { text: 'VERZENDEN KAN' }]))

    expect(slabs).toEqual([])
    expect(note).toBe('No PSA label text found in the photos.')
  })

  it('reads both slabs when one photo shows two of them', () => {
    const lines = [
      ...label([{ text: '2024 POKEMON TEF EN #212' }, { text: 'IRON CROWN ex GEM MT' }, { text: 'SPECIAL ART RARE 10' }], { x: 100 }),
      ...label([{ text: '2021 POKEMON SWSH BSP #145' }, { text: 'CHARIZARD V GEM MT' }, { text: 'BLACK STAR PROMO 10' }], { x: 900 })
    ]

    expect(parsePsaLabels(lines).slabs.map((slab) => slab.cardName)).toEqual(['IRON CROWN EX', 'CHARIZARD V'])
  })
})

describe('mergeSlabs', () => {
  const base = {
    year: '2024',
    setLine: 'POKEMON TEF EN',
    varietyLine: null,
    cardNumber: null,
    language: 'english' as const,
    languageLabel: 'EN',
    grade: null,
    reverseHolo: false,
    firstEdition: false
  }

  it('fills a partial reading from the photo that read the same slab better', () => {
    const merged = mergeSlabs([
      { ...base, certNumber: null, cardName: 'IRON CROWN EX', grade: 10 },
      { ...base, certNumber: '92847163', cardName: 'IRON CROWN EX', cardNumber: '212' }
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ certNumber: '92847163', cardNumber: '212', grade: 10 })
  })

  it('keeps two different certification numbers apart', () => {
    const merged = mergeSlabs([
      { ...base, certNumber: '92847163', cardName: 'IRON CROWN EX' },
      { ...base, certNumber: '104928374', cardName: 'PIKACHU' }
    ])

    expect(merged).toHaveLength(2)
  })
})

describe('mergeReadings', () => {
  it('reports the first reason when no photo produced a label', () => {
    expect(mergeReadings([{ slabs: [], note: 'No PSA label text found in the photos.' }])).toEqual({
      slabs: [],
      note: 'No PSA label text found in the photos.'
    })
  })
})
