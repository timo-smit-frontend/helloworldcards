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

describe('a photo that lost a row of the label', () => {
  /** The back of the slab, where the plastic edge came back as a line of its own above the name. */
  const front = label([{ text: '2025 POKEMON SVP EN' }, { text: 'CHARIZARD EX' }, { text: 'CHARIZARD EX SPECIAL COLL' }])
  const back = label([
    { text: '2025 POKEMON SVP EN' },
    { text: 'RS' },
    { text: 'CHARIZARD EX MINT' },
    { text: 'CHARIZARD EX SPECIAL COLL 9' }
  ])

  it('reads the card name off the row PSA printed the grade word on', () => {
    expect(parsePsaLabels(back).slabs[0]).toMatchObject({ cardName: 'CHARIZARD EX', grade: 9 })
  })

  it('is not fooled by a scrap long enough to pass for a word', () => {
    // `AWA` is the slab's printed border. Only the grade word says where the name is.
    const scrap = label([{ text: '2026 POKEMON ASC EN #236' }, { text: 'AWA' }, { text: 'SLURPUFF MINT' }, { text: 'ILLUSTRATION RARE 9' }])

    expect(parsePsaLabels(scrap).slabs[0]).toMatchObject({
      cardName: 'SLURPUFF',
      varietyLine: 'ILLUSTRATION RARE',
      cardNumber: '236',
      grade: 9
    })
  })

  it('is still one slab, not a listing with two graded cards in it', () => {
    expect(mergeReadings([parsePsaLabels(front), parsePsaLabels(back)]).slabs).toHaveLength(1)
  })

  it('folds a reading whose name was pushed onto the variety row into the same slab', () => {
    const base = {
      year: '2026',
      setLine: 'POKEMON ASC EN',
      cardNumber: null,
      language: 'english' as const,
      languageLabel: 'EN',
      grade: null,
      reverseHolo: false,
      firstEdition: false,
      certNumber: null
    }

    const merged = mergeSlabs([
      { ...base, cardName: 'SLURPUFF', varietyLine: 'ILLUSTRATION RARE' },
      { ...base, cardName: 'AWA', varietyLine: 'SLURPUFF' }
    ])

    expect(merged).toHaveLength(1)
  })
})

describe('two readings of one slab', () => {
  /** Front and back photos of the same slab, with the plastic edge read as stray `I`s. */
  const front = label([{ text: '2025 POKEMON | JTG EN' }, { text: "| | N'S RESHIRAM" }, { text: '| | ENHANCED BSTR BOX TOPPER' }])
  const back = label([{ text: '2025 POKEMON JTG EN #167' }, { text: "N'S RESHIRAM MINT" }, { text: 'ENHANCED BSTR BOX TOPPER 9' }])

  it('drops the border marks OCR read as letters', () => {
    expect(parsePsaLabels(front).slabs[0]).toMatchObject({ setLine: 'POKEMON JTG EN', cardName: "N'S RESHIRAM" })
  })

  it('folds them into one card rather than reporting a second slab', () => {
    const merged = mergeReadings([parsePsaLabels(front), parsePsaLabels(back)])

    expect(merged.slabs).toHaveLength(1)
    expect(merged.slabs[0]).toMatchObject({ cardName: "N'S RESHIRAM", cardNumber: '167', grade: 9 })
  })
})

describe('reading Apple Vision output', () => {
  /**
   * Lines exactly as Apple Vision returned them for a Charizard V slab on Marktplaats —
   * each column of the label a line of its own, the card's artwork below it. Tesseract
   * read this label as `_HARIZARD V SH ARIE DEE OL EZ A SDS`, and no search found it.
   */
  const charizardSlab: OcrLine[] = [
    { text: '2022 POKEMON JPN.', confidence: 100, bbox: { x0: 204, y0: 148, x1: 494, y1: 172 } },
    { text: 'CHARIZARD V', confidence: 100, bbox: { x0: 202, y0: 174, x1: 402, y1: 198 } },
    { text: 'CHARIZARD/RAYQUAZA SDS', confidence: 100, bbox: { x0: 202, y0: 200, x1: 620, y1: 226 } },
    { text: '#001', confidence: 100, bbox: { x0: 680, y0: 144, x1: 750, y1: 168 } },
    { text: 'GEM MT', confidence: 100, bbox: { x0: 634, y0: 171, x1: 750, y1: 195 } },
    { text: '10', confidence: 100, bbox: { x0: 720, y0: 198, x1: 754, y1: 222 } },
    { text: '98450619', confidence: 100, bbox: { x0: 616, y0: 228, x1: 752, y1: 250 } },
    { text: 'UTTKT', confidence: 30, bbox: { x0: 300, y0: 401, x1: 484, y1: 438 } },
    { text: 'HP220', confidence: 100, bbox: { x0: 598, y0: 398, x1: 698, y1: 438 } }
  ]

  it('reads every row of the label, the right-hand column included', () => {
    const { slabs, note } = parsePsaLabels(charizardSlab)

    expect(note).toBeNull()
    expect(slabs).toEqual([
      expect.objectContaining({
        certNumber: '98450619',
        year: '2022',
        cardName: 'CHARIZARD V',
        varietyLine: 'CHARIZARD/RAYQUAZA SDS',
        cardNumber: '001',
        language: 'japanese',
        grade: 10
      })
    ])
  })

  it('reads the same slab photographed twice as one card, not a lot of two', () => {
    // The second photo of the same listing, taken closer: every line has moved.
    const closer = charizardSlab.map((line) => ({
      ...line,
      bbox: { x0: line.bbox.x0 * 1.4 - 80, y0: line.bbox.y0 * 1.4 + 300, x1: line.bbox.x1 * 1.4 - 80, y1: line.bbox.y1 * 1.4 + 300 }
    }))

    const { slabs } = mergeReadings([parsePsaLabels(charizardSlab), parsePsaLabels(closer)])

    expect(slabs).toHaveLength(1)
  })

  it("finds no label in a seller's banner photo, however much Pokémon text it holds", () => {
    const banner: OcrLine[] = [
      { text: 'TRADING CARD GAME', confidence: 100, bbox: { x0: 29, y0: 268, x1: 123, y1: 312 } },
      { text: 'Kijk ook bij mijn andere', confidence: 100, bbox: { x0: 328, y0: 554, x1: 738, y1: 598 } },
      { text: 'Pokémon advertentie', confidence: 100, bbox: { x0: 337, y0: 593, x1: 730, y1: 636 } },
      { text: '10', confidence: 100, bbox: { x0: 980, y0: 678, x1: 1000, y1: 690 } },
      { text: 'GEM MNT', confidence: 100, bbox: { x0: 974, y0: 694, x1: 1030, y1: 706 } }
    ]

    expect(parsePsaLabels(banner).slabs).toEqual([])
  })
})
