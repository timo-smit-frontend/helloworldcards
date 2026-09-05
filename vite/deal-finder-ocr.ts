import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { createWorker, PSM, type Worker } from 'tesseract.js'
import { mergeReadings, parsePsaLabels, type LabelOcrResult, type OcrLine } from '../app/services/deal-finder/label-ocr'
import type { SlabReader } from '../app/services/deal-finder/scan'

/** Tesseract downloads its English model once and reuses it from here afterwards. */
const MODEL_CACHE = path.join('.cache', 'tesseract')

/**
 * PSA label text is a small part of a phone photo, so every image is blown up to
 * this width before it is read — below roughly 1600px the 8pt rows stop resolving.
 */
const OCR_WIDTH = 2000

const MAX_IMAGE_BYTES = 12 * 1024 * 1024

let workerPromise: Promise<Worker> | null = null

function ocrWorker(root: string): Promise<Worker> {
  const cachePath = path.join(root, MODEL_CACHE)
  // Tesseract writes the model straight into this directory and silently gives up
  // re-downloading it every scan if it is not there.
  fs.mkdirSync(cachePath, { recursive: true })

  workerPromise ??= createWorker('eng', undefined, { cachePath, logger: () => {} }).then(async (worker) => {
    await worker.setParameters({
      // Photos carry no DPI, and Tesseract's guess makes it discard the label rows as noise.
      user_defined_dpi: '300',
      preserve_interword_spaces: '1'
    })
    return worker
  })

  return workerPromise
}

/** Called when a scan finishes; the next one starts a fresh worker. */
export async function closeSlabReader(): Promise<void> {
  const pending = workerPromise
  workerPromise = null
  if (pending) {
    await (await pending).terminate().catch(() => {})
  }
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    return bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_BYTES ? bytes : null
  } catch {
    // One unreachable photo should not cost us the listing.
    return null
  }
}

/**
 * Straighten, upscale and flatten the photo into something Tesseract can read:
 * grey, contrast-stretched and sharpened, which is what lifts the label rows out
 * of the plastic glare they are usually photographed through.
 */
async function prepare(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes)
      .rotate()
      .resize({ width: OCR_WIDTH, withoutEnlargement: false, fit: 'inside' })
      .grayscale()
      .normalise()
      .sharpen()
      .png()
      .toBuffer()
  } catch {
    return null
  }
}

function linesFrom(blocks: NonNullable<Awaited<ReturnType<Worker['recognize']>>['data']['blocks']>): OcrLine[] {
  const lines: OcrLine[] = []
  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        lines.push({ text: line.text, confidence: line.confidence, bbox: line.bbox })
      }
    }
  }
  return lines
}

async function readImage(worker: Worker, image: Buffer, mode: PSM): Promise<LabelOcrResult> {
  await worker.setParameters({ tessedit_pageseg_mode: mode })
  const { data } = await worker.recognize(image, {}, { blocks: true, text: false })
  return parsePsaLabels(linesFrom(data.blocks ?? []))
}

/**
 * Tesseract's page layout analysis reads the label rows cleanly but drops the
 * right-hand column; sparse-text mode finds that column but scatters the rows.
 * Running both and merging is what gets a whole label off one photo.
 */
const PASSES = [PSM.AUTO, PSM.SPARSE_TEXT]

/** A reading we can price without looking at another photo of the same listing. */
function isComplete(result: LabelOcrResult): boolean {
  const slab = result.slabs.length === 1 ? result.slabs[0]! : null
  return slab != null && slab.cardName != null && slab.grade != null && (slab.certNumber != null || slab.cardNumber != null)
}

/**
 * Reads PSA labels off listing photos with a local Tesseract worker.
 *
 * Everything here runs on this machine and costs nothing: the model is downloaded
 * once and cached, and the certification number it recovers is what the free PSA
 * lookup then turns into the authoritative card.
 */
export function createSlabReader({ root = process.cwd() }: { root?: string } = {}): SlabReader {
  return async ({ imageUrls }) => {
    const worker = await ocrWorker(root)
    const results: LabelOcrResult[] = []

    for (const url of imageUrls) {
      const bytes = await download(url)
      const image = bytes ? await prepare(bytes) : null
      if (!image) {
        continue
      }

      const passes: LabelOcrResult[] = []
      for (const mode of PASSES) {
        passes.push(await readImage(worker, image, mode))
        if (isComplete(passes[passes.length - 1]!)) {
          break
        }
      }

      const result = mergeReadings(passes)
      results.push(result)
      if (isComplete(result)) {
        break
      }
    }

    if (results.length === 0) {
      return { slabs: [], note: 'No usable photos on the listing.' }
    }

    return mergeReadings(results)
  }
}
