import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { parsePsaLabelOcr, extractCardNumberFromOcr } from './psa-label'

const execFileAsync = promisify(execFile)

function scoreOcrText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) {
    return 0
  }

  let score = 0
  const parsed = parsePsaLabelOcr(trimmed)
  if (parsed) {
    score += 80
    if (parsed.cardNumber) {
      score += 40
    }
    // Prefer clean label rows over noise-filled ones.
    const rowBlob = parsed.rows.join(' ')
    const junk = (rowBlob.match(/[^A-Za-z0-9.#&\s/-]/g) ?? []).length
    score += Math.max(0, 30 - junk)
    if (/\b(?:DEWGONG|PIKACHU|CHARIZARD|CHANSEY|ALAKAZAM|GLACEON|IVYSAUR|LATIOS|GENGAR)\b/i.test(rowBlob)) {
      score += 25
    }
  } else if (extractCardNumberFromOcr(trimmed)) {
    score += 25
  }

  if (/\bPOKEMON\b/i.test(trimmed) || /\bP\.?\s*M\.?\b/i.test(trimmed)) {
    score += 15
  }
  if (/#\s*\d{1,4}\b/i.test(trimmed)) {
    score += 20
  }

  return score
}

async function tesseractPng(filePath: string, psm: string, tesseractBin: string): Promise<string> {
  const { stdout } = await execFileAsync(tesseractBin, [filePath, 'stdout', '--psm', psm], {
    maxBuffer: 2 * 1024 * 1024
  })
  return stdout
}

async function prepareVariants(image: Uint8Array): Promise<Array<{ name: string; buffer: Buffer }>> {
  const base = sharp(image, { failOn: 'none' }).rotate()
  const meta = await base.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width < 32 || height < 32) {
    return [{ name: 'full', buffer: await sharp(image, { failOn: 'none' }).png().toBuffer() }]
  }

  const variants: Array<{ name: string; buffer: Buffer }> = []

  variants.push({
    name: 'full',
    buffer: await sharp(image, { failOn: 'none' })
      .rotate()
      .grayscale()
      .normalize()
      .resize({ width: Math.min(1600, Math.max(width * 2, 900)), withoutEnlargement: false })
      .png()
      .toBuffer()
  })

  const bandHeight = Math.max(48, Math.round(height * 0.22))
  variants.push({
    name: 'label',
    buffer: await sharp(image, { failOn: 'none' })
      .rotate()
      .extract({ left: 0, top: 0, width, height: Math.min(bandHeight, height) })
      .grayscale()
      .normalize()
      .resize({ width: Math.max(1400, width * 3) })
      .png()
      .toBuffer()
  })

  // High-contrast label pass helps when plastic glare washes out the header.
  variants.push({
    name: 'labelHard',
    buffer: await sharp(image, { failOn: 'none' })
      .rotate()
      .extract({ left: 0, top: 0, width, height: Math.min(bandHeight, height) })
      .grayscale()
      .normalize()
      .linear(1.8, -60)
      .threshold(150)
      .resize({ width: Math.max(1600, width * 3) })
      .png()
      .toBuffer()
  })

  // Top-right #N crop — the most important field when the left rows are unreadable.
  const hashLeft = Math.round(width * 0.55)
  const hashHeight = Math.max(40, Math.round(height * 0.1))
  variants.push({
    name: 'hash',
    buffer: await sharp(image, { failOn: 'none' })
      .rotate()
      .extract({
        left: hashLeft,
        top: Math.round(height * 0.015),
        width: width - hashLeft,
        height: Math.min(hashHeight, height)
      })
      .grayscale()
      .normalize()
      .resize({ width: 700 })
      .threshold(145)
      .png()
      .toBuffer()
  })

  return variants
}

/**
 * OCR a PSA slab photo. Converts/normalizes via sharp and tries a few Tesseract
 * page-segmentation modes, keeping the pass that looks most like a PSA label.
 */
export async function ocrImageBytes(image: Uint8Array, tesseractBin = 'tesseract'): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'psa-ocr-'))
  try {
    const variants = await prepareVariants(image)
    let best = ''
    let bestScore = 0

    for (const variant of variants) {
      const filePath = path.join(dir, `${variant.name}.png`)
      await fs.promises.writeFile(filePath, variant.buffer)
      for (const psm of variant.name === 'hash' ? ['7', '8', '10'] : ['4', '6', '11']) {
        try {
          const text = await tesseractPng(filePath, psm, tesseractBin)
          const score = scoreOcrText(text)
          if (score > bestScore) {
            bestScore = score
            best = text
          }
        } catch {
          // Keep trying other passes.
        }
      }
    }

    return best
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
