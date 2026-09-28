import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { createWorker, PSM, type Worker } from 'tesseract.js'
import { mergeReadings, parsePsaLabels, type LabelOcrResult, type OcrLine } from '../app/services/deal-finder/label-ocr'
import type { SlabReader } from '../app/services/deal-finder/scan'

const execFileAsync = promisify(execFile)

/**
 * The Vision helper's source, next to this file, and where its compiled copies live.
 * Each build is named after a hash of the source, so an edited helper is rebuilt and an
 * unchanged one never is.
 */
const VISION_SOURCE = path.join('vite', 'deal-finder-vision.swift')
const VISION_BUILDS = path.join('.cache', 'deal-finder-vision')

/** Tesseract downloads its English model once and reuses it from here afterwards. */
const MODEL_CACHE = path.join('.cache', 'tesseract')

/**
 * PSA label text is a small part of a phone photo, so for Tesseract every image is blown
 * up to this width before it is read — below roughly 1600px the 8pt rows stop resolving.
 */
const OCR_WIDTH = 2000

const MAX_IMAGE_BYTES = 12 * 1024 * 1024

/** Tesseract runs as a WebAssembly worker pinned to one core; one per spare core, up to four. */
const POOL_SIZE = Math.max(1, Math.min(4, os.cpus().length - 1))

/** How long a photo may take before the Vision helper is taken for stuck. */
const VISION_READ_TIMEOUT_MS = 30_000

/** Reads one downloaded photo, whatever it takes to do so. */
type PhotoEngine = {
  name: 'vision' | 'tesseract'
  read(bytes: Buffer): Promise<LabelOcrResult>
  close(): Promise<void>
}

let engine: Promise<PhotoEngine> | null = null
let visionBuild: Promise<string | null> | null = null

/**
 * Compile the Vision helper, once per version of its source.
 *
 * The first build takes the better part of a minute while Swift warms its module cache,
 * which is why the dev server asks for it as it starts rather than leaving it to the
 * first scan. Anywhere there is no Swift — another OS, or the command line tools gone
 * after a macOS update — this answers null and the scan reads with Tesseract instead.
 */
export function prepareVisionReader(root = process.cwd()): Promise<string | null> {
  visionBuild ??= buildVision(root).catch((error: unknown) => {
    console.warn(`[deal-finder] Apple Vision is not available, reading slabs with Tesseract: ${errorText(error)}`)
    return null
  })
  return visionBuild
}

async function buildVision(root: string): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return null
  }

  const source = path.join(root, VISION_SOURCE)
  const hash = createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0, 12)
  const dir = path.join(root, VISION_BUILDS)
  const binary = path.join(dir, `vision-ocr-${hash}`)
  if (fs.existsSync(binary)) {
    return binary
  }

  fs.mkdirSync(dir, { recursive: true })
  const building = `${binary}.${process.pid}.tmp`
  await execFileAsync('swiftc', ['-O', source, '-o', building], { timeout: 5 * 60_000 })
  fs.renameSync(building, binary)

  // Builds of an older source are never run again.
  for (const entry of fs.readdirSync(dir)) {
    if (entry !== path.basename(binary)) {
      fs.rmSync(path.join(dir, entry), { force: true })
    }
  }
  return binary
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0]! : String(error)
}

/** The engine this machine reads with: Apple Vision where it can be built, Tesseract otherwise. */
function photoEngine(root: string): Promise<PhotoEngine> {
  engine ??= prepareVisionReader(root).then((binary) => (binary ? visionEngine(binary) : tesseractEngine(root)))
  return engine
}

/** Called when the last scan finishes; the next one starts a fresh helper. */
export async function closeSlabReader(): Promise<void> {
  const pending = engine
  engine = null
  await (await pending?.catch(() => null))?.close()
}

/** What the helper was given a photo as: its bytes, under a name that says what kind. */
function imageExtension(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return '.png'
  if (bytes.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp'
  return '.img'
}

/**
 * The Vision helper, kept running for as long as a scan is.
 *
 * It answers photos in whatever order it finishes them, each tagged with the id it was
 * asked under. If it stops — killed, or crashed on a photo — every read still waiting
 * fails, and the next photo starts it again rather than the scan losing its reader.
 */
function visionEngine(binary: string): PhotoEngine {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hwc-deal-finder-'))
  let child: ChildProcessWithoutNullStreams | null = null
  type Waiting = { child: ChildProcessWithoutNullStreams; resolve: (lines: OcrLine[]) => void; reject: (error: Error) => void }
  const waiting = new Map<string, Waiting>()
  let nextId = 0

  /** Fail the reads a helper was handling — all of them, or only those of one that stopped. */
  const fail = (error: Error, of?: ChildProcessWithoutNullStreams) => {
    for (const [id, pending] of waiting) {
      if (!of || pending.child === of) {
        waiting.delete(id)
        pending.reject(error)
      }
    }
  }

  const start = (): ChildProcessWithoutNullStreams => {
    const started = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    // A photo sent to a helper that has just died would otherwise throw EPIPE at the
    // dev server itself; the exit below already fails that read.
    started.stdin.on('error', () => undefined)
    let buffer = ''
    started.stdout.setEncoding('utf8')
    started.stdout.on('data', (chunk: string) => {
      buffer += chunk
      for (let newline = buffer.indexOf('\n'); newline !== -1; newline = buffer.indexOf('\n')) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        try {
          const answer = JSON.parse(line) as { id: string; lines: OcrLine[] }
          waiting.get(answer.id)?.resolve(answer.lines)
          waiting.delete(answer.id)
        } catch {
          // Half a line from a helper that died mid-write; its reads fail on exit below.
        }
      }
    })
    started.stderr.resume()
    const stopped = (error: Error) => {
      if (child === started) {
        child = null
      }
      fail(error, started)
    }
    started.on('exit', () => stopped(new Error('The Vision reader stopped.')))
    started.on('error', stopped)
    return started
  }

  const recognise = (file: string): Promise<OcrLine[]> =>
    new Promise((resolve, reject) => {
      const id = String(nextId++)
      const timer = setTimeout(() => {
        waiting.delete(id)
        reject(new Error('The Vision reader took too long over a photo.'))
      }, VISION_READ_TIMEOUT_MS)
      child ??= start()
      waiting.set(id, {
        child,
        resolve: (lines) => {
          clearTimeout(timer)
          resolve(lines)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        }
      })
      child.stdin.write(`${id}\t${file}\n`)
    })

  return {
    name: 'vision',
    async read(bytes) {
      const file = path.join(scratch, `${randomUUID()}${imageExtension(bytes)}`)
      fs.writeFileSync(file, bytes)
      try {
        return parsePsaLabels(await recognise(file))
      } finally {
        fs.rmSync(file, { force: true })
      }
    },
    async close() {
      const running = child
      child = null
      if (running) {
        const exited = new Promise((resolve) => running.once('exit', resolve))
        running.stdin.end()
        await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000).unref())])
        running.kill()
      }
      fail(new Error('The Vision reader was closed.'))
      fs.rmSync(scratch, { recursive: true, force: true })
    }
  }
}

type WorkerPool = {
  run<T>(task: (worker: Worker) => Promise<T>): Promise<T>
  close(): Promise<void>
}

function spawnTesseract(cachePath: string): Promise<Worker> {
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
        const worker = await spawnTesseract(cachePath)
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

/**
 * Straighten, upscale and flatten the photo into something Tesseract can read:
 * grey, contrast-stretched and sharpened, which is what lifts the label rows out
 * of the plastic glare they are usually photographed through.
 */
async function prepareForTesseract(bytes: Buffer): Promise<Buffer | null> {
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

async function readWithTesseract(worker: Worker, image: Buffer, mode: PSM): Promise<LabelOcrResult> {
  await worker.setParameters({ tessedit_pageseg_mode: mode })
  const { data } = await worker.recognize(image, {}, { blocks: true, text: false })
  return parsePsaLabels(linesFrom(data.blocks ?? []))
}

/**
 * Tesseract, for a machine without Apple Vision.
 *
 * Its page layout analysis reads the label rows cleanly but drops the right-hand column;
 * sparse-text mode finds that column but scatters the rows, and costs several times as
 * much for it. So a photo only pays for the sparse pass when the layout pass left the
 * card unsettled.
 */
function tesseractEngine(root: string): PhotoEngine {
  const workers = createPool(root, POOL_SIZE)
  return {
    name: 'tesseract',
    async read(bytes) {
      const image = await prepareForTesseract(bytes)
      if (!image) {
        return { slabs: [], note: 'Could not open the photo.' }
      }
      const layout = await workers.run((worker) => readWithTesseract(worker, image, PSM.AUTO))
      return isComplete(layout)
        ? mergeReadings([layout])
        : mergeReadings([layout, await workers.run((worker) => readWithTesseract(worker, image, PSM.SPARSE_TEXT))])
    },
    close: () => workers.close()
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

/** A reading we can price without looking at another photo of the same listing. */
function isComplete(result: LabelOcrResult): boolean {
  const slab = result.slabs.length === 1 ? result.slabs[0]! : null
  return slab != null && slab.cardName != null && slab.grade != null && (slab.certNumber != null || slab.cardNumber != null)
}

/**
 * Reads PSA labels off listing photos, on this machine and at no cost.
 *
 * On a Mac that is Apple's own text recogniser — the one behind Live Text — which reads a
 * label through glare, at an angle or on its side in well under a tenth of a second.
 * Tesseract, which this used to be, took seconds a photo and still misread most of them:
 * one slab photographed front and back came out as a lot of two, `GEM MT 10` as PSA 4,
 * and names as strings of border fragments that no Google search could find.
 *
 * Photos still count in order: the first one is the listing's main photo, nearly always
 * the front of the slab, and when it answers nothing else is read. Only when it comes up
 * short are the others read — all at once — and everything after the first photo that
 * answered is dropped, so a seller's photo of their other slabs cannot make a lot of it.
 */
export function createSlabReader({ root = process.cwd() }: { root?: string } = {}): SlabReader {
  return async ({ imageUrls }) => {
    const reader = await photoEngine(root)

    // Downloads are network rather than reading, so the whole set is started at once —
    // but the first usable photo is read the moment it is in.
    const pending = imageUrls.map((url) => download(url))

    let lead: Buffer | null = null
    let leadIndex = -1
    for (const [index, photo] of pending.entries()) {
      lead = await photo
      if (lead) {
        leadIndex = index
        break
      }
    }
    if (!lead) {
      return { slabs: [], note: 'No usable photos on the listing.' }
    }

    const read = (bytes: Buffer) =>
      reader.read(bytes).catch((error: unknown): LabelOcrResult => ({ slabs: [], note: `Could not read a photo: ${errorText(error)}` }))

    const first = await read(lead)
    if (isComplete(first)) {
      return first
    }

    const rest = (await Promise.all(pending.slice(leadIndex + 1))).filter((photo): photo is Buffer => photo != null)
    const results = [first, ...(await Promise.all(rest.map(read)))]
    const answered = results.findIndex(isComplete)
    return mergeReadings(answered === -1 ? results : results.slice(0, answered + 1))
  }
}
