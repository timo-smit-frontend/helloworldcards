import fs from 'node:fs'
import os from 'node:os'
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

/**
 * How many photos are read at the same time.
 *
 * Tesseract runs as a WebAssembly worker pinned to one core, so reading a listing's
 * photos one after another left every other core on this machine idle — and the photos
 * are the slow half of the scan: a first pass costs about a second and the fallback
 * pass a photo needs when that one comes up empty costs several. One worker per photo
 * the reader is ever handed brings a listing's whole photo set down to roughly the
 * time of its slowest single photo, without changing a word of what is read off them.
 */
const POOL_SIZE = Math.max(1, Math.min(4, os.cpus().length - 1))

type WorkerPool = {
  run<T>(task: (worker: Worker) => Promise<T>): Promise<T>
  close(): Promise<void>
}

let pool: WorkerPool | null = null

function spawn(cachePath: string): Promise<Worker> {
  return createWorker('eng', undefined, { cachePath, logger: () => {} }).then(async (worker) => {
    await worker.setParameters({
      // Photos carry no DPI, and Tesseract's guess makes it discard the label rows as noise.
      user_defined_dpi: '300',
      preserve_interword_spaces: '1'
    })
    return worker
  })
}

/**
 * A pool of Tesseract workers, grown one at a time as photos actually arrive.
 *
 * Booting a worker costs half a second, so a scan that only ever hands over one photo
 * at a time never pays for more than the one worker it uses. A task holds its worker
 * exclusively, which is what makes it safe to switch page segmentation mode per read.
 */
function createPool(root: string, size: number): WorkerPool {
  const cachePath = path.join(root, MODEL_CACHE)
  // Tesseract writes the model straight into this directory and silently gives up
  // re-downloading it every scan if it is not there.
  fs.mkdirSync(cachePath, { recursive: true })

  const created: Worker[] = []
  const idle: Worker[] = []
  const waiting: Array<(worker: Worker) => void> = []
  let starting = 0

  async function take(): Promise<Worker> {
    const free = idle.pop()
    if (free) {
      return free
    }
    if (created.length + starting < size) {
      starting += 1
      try {
        const worker = await spawn(cachePath)
        created.push(worker)
        return worker
      } finally {
        starting -= 1
      }
    }
    return await new Promise<Worker>((resolve) => waiting.push(resolve))
  }

  function give(worker: Worker): void {
    const next = waiting.shift()
    if (next) {
      next(worker)
    } else {
      idle.push(worker)
    }
  }

  return {
    async run(task) {
      const worker = await take()
      try {
        return await task(worker)
      } finally {
        give(worker)
      }
    },
    async close() {
      const all = [...created]
      created.length = 0
      idle.length = 0
      waiting.length = 0
      await Promise.all(all.map((worker) => worker.terminate().catch(() => {})))
    }
  }
}

/** Called when a scan finishes; the next one starts a fresh worker. */
export async function closeSlabReader(): Promise<void> {
  const pending = pool
  pool = null
  await pending?.close()
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

/** A reading we can price without looking at another photo of the same listing. */
function isComplete(result: LabelOcrResult): boolean {
  const slab = result.slabs.length === 1 ? result.slabs[0]! : null
  return slab != null && slab.cardName != null && slab.grade != null && (slab.certNumber != null || slab.cardNumber != null)
}

/**
 * Reads PSA labels off listing photos with local Tesseract workers.
 *
 * Everything here runs on this machine and costs nothing: the model is downloaded
 * once and cached, and the certification number it recovers is what the free PSA
 * lookup then turns into the authoritative card.
 *
 * Tesseract's page layout analysis reads the label rows cleanly but drops the
 * right-hand column; sparse-text mode finds that column but scatters the rows, and
 * costs several times as much for it. So a photo only pays for the sparse pass when
 * the layout pass left the card unsettled, and photos are still counted in order —
 * what changed is that the photos which are only there in case the main one fails are
 * now read all at once across the pool instead of one after another.
 */
export function createSlabReader({ root = process.cwd() }: { root?: string } = {}): SlabReader {
  return async ({ imageUrls }) => {
    const workers = (pool ??= createPool(root, POOL_SIZE))

    // Fetching and flattening the photos is network and image work rather than OCR, so
    // the whole set is started at once — but the first usable one is read the moment it
    // is ready, rather than made to wait for photos that will probably never be looked at.
    const pending = imageUrls.map(async (url) => {
      const bytes = await download(url)
      return bytes ? await prepare(bytes) : null
    })

    let lead: Buffer | null = null
    let leadIndex = -1
    for (const [index, image] of pending.entries()) {
      lead = await image
      if (lead) {
        leadIndex = index
        break
      }
    }
    if (!lead) {
      return { slabs: [], note: 'No usable photos on the listing.' }
    }

    /** Both passes over one photo, the second only if the first left the card unsettled. */
    const read = async (image: Buffer): Promise<LabelOcrResult> => {
      const layout = await workers.run((worker) => readImage(worker, image, PSM.AUTO))
      return isComplete(layout)
        ? mergeReadings([layout])
        : mergeReadings([layout, await workers.run((worker) => readImage(worker, image, PSM.SPARSE_TEXT))])
    }

    // Photos still count in order, and the first one is the listing's main photo —
    // nearly always the front of the slab. When it answers, which is the usual case,
    // nothing else is read at all; only when it comes up short is the rest of the set
    // read, and then all at once rather than one photo after another.
    const first = await read(lead)
    if (isComplete(first)) {
      return first
    }

    const rest = (await Promise.all(pending.slice(leadIndex + 1))).filter((image): image is Buffer => image != null)
    const results = [first, ...(await Promise.all(rest.map(read)))]

    // Everything after the photo that answered the question is dropped, exactly as it
    // was when the photos were read one after another.
    const answered = results.findIndex(isComplete)
    return mergeReadings(answered === -1 ? results : results.slice(0, answered + 1))
  }
}
