// Media uploaded through the CMS before the admin started sending resized copies only
// exists in R2 as a full-size original, so every request for a variant falls back to
// that original. This walks the media library, encodes the missing variants locally, and
// pushes them to the bucket. Run it once after deploying, or whenever media was uploaded
// by an older admin build: npm run media:backfill
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeMediaVariants } from '../vite/media-variants'
import { mediaVariantKey } from '../app/services/responsiveImage'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const R2_BUCKET = 'helloworldcards-media'
const DATABASE = 'helloworldcards'
const RASTER_KEY = /\.(png|jpe?g|webp)$/i
const remote = !process.argv.includes('--local')
const location = remote ? '--remote' : '--local'

function wrangler(args: string[], options: { quiet?: boolean } = {}): string {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'inherit']
  })
}

function mediaKeys(): string[] {
  const output = wrangler(['d1', 'execute', DATABASE, location, '--json', '--command', 'SELECT key FROM media ORDER BY id'])
  const parsed = JSON.parse(output.slice(output.indexOf('['))) as Array<{ results: Array<{ key: string }> }>
  return parsed.flatMap((page) => page.results.map((row) => row.key)).filter((key) => RASTER_KEY.test(key))
}

function objectToFile(key: string, filePath: string): boolean {
  try {
    wrangler(['r2', 'object', 'get', `${R2_BUCKET}/${key}`, location, '--file', filePath], { quiet: true })
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-backfill-'))
  const keys = mediaKeys()
  console.log(`media-backfill: ${keys.length} images in the library`)

  let filled = 0
  let skipped = 0
  for (const key of keys) {
    // One probe is enough: variants are always written as a set.
    if (objectToFile(mediaVariantKey(key, 400, 'webp'), path.join(workDir, 'probe'))) {
      skipped += 1
      continue
    }
    const originalPath = path.join(workDir, path.basename(key))
    if (!objectToFile(key, originalPath)) {
      console.log(`media-backfill: ${key} has no object in R2, skipping`)
      continue
    }
    const variants = await encodeMediaVariants(originalPath, key)
    for (const [variantKey, buffer] of variants) {
      const variantPath = path.join(workDir, path.basename(variantKey))
      await fs.writeFile(variantPath, buffer)
      wrangler([
        'r2',
        'object',
        'put',
        `${R2_BUCKET}/${variantKey}`,
        location,
        '--file',
        variantPath,
        '--content-type',
        variantKey.endsWith('.avif') ? 'image/avif' : 'image/webp'
      ])
    }
    filled += 1
    console.log(`media-backfill: ${key} (${variants.size} variants)`)
  }

  await fs.rm(workDir, { recursive: true, force: true })
  console.log(`media-backfill: done, ${filled} filled, ${skipped} already had variants`)
}

await main()
