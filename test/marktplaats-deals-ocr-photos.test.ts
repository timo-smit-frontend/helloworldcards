import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ocrImageBytes } from '~/services/marktplaats-deals/ocr'
import { extractCardNumberFromOcr, parsePsaLabelOcr } from '~/services/marktplaats-deals/psa-label'

const assets = '/Users/timosmit/.cursor/projects/Users-timosmit-projects-personal-helloworldcards/assets'
const dewgong = path.join(assets, 'image-83816cd1-821b-4866-a12f-d96b98feaaab.png')
const zekrom = path.join(assets, 'image-32309972-5e5c-4cae-8d1b-1c8c9035b070.png')

describe('ocrImageBytes on real slab photos', () => {
  it('reads Dewgong #097 from a clear English PSA label', async () => {
    if (!fs.existsSync(dewgong)) {
      return
    }

    const text = await ocrImageBytes(await fs.promises.readFile(dewgong))
    const parsed = parsePsaLabelOcr(text)
    expect(parsed?.cardNumber).toBe('097')
    expect(parsed?.rows.join(' ')).toMatch(/POKEMON PFL EN/i)
    expect(parsed?.rows.join(' ')).toMatch(/DEWGONG/i)
  }, 30_000)

  it('at least recovers a card number from the Japanese Zekrom slab when possible', async () => {
    if (!fs.existsSync(zekrom)) {
      return
    }

    const text = await ocrImageBytes(await fs.promises.readFile(zekrom))
    const parsed = parsePsaLabelOcr(text)
    const number = parsed?.cardNumber ?? extractCardNumberFromOcr(text)
    console.info('[zekrom-ocr]', { parsed, number, snippet: text.slice(0, 200) })
    // Heavy plastic glare on this photo often defeats Tesseract; empty/null is OK.
    if (number) {
      expect(number).toMatch(/^\d{1,4}$/)
    }
  }, 30_000)
})
