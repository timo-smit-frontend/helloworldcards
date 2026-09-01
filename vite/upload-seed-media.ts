import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { seedMediaFiles } from '../app/cms/seed-media'
import { encodeMediaVariants } from './media-variants'
import { variantSettingsKey } from './responsive-image-build'

const R2_BUCKET = 'helloworldcards-media'
const MANIFEST_KEY = '_media-variants-manifest.json'

export type MediaUploadManifest = {
  settings: string
  files: Record<string, string>
}

function wranglerR2Put(localPath: string, key: string, contentType: string) {
  execFileSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${R2_BUCKET}/${key}`, '--file', localPath, '--content-type', contentType, '--remote'],
    { stdio: 'inherit' }
  )
}

async function sourceHash(originalPath: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(variantSettingsKey())
  hash.update(await fs.readFile(originalPath))
  return hash.digest('hex').slice(0, 16)
}

export async function buildMediaUploadManifest(seedDir: string): Promise<MediaUploadManifest> {
  const files: Record<string, string> = {}
  for (const file of seedMediaFiles) {
    files[file.key] = await sourceHash(path.join(seedDir, file.filename))
  }
  return { settings: variantSettingsKey(), files }
}

export function mediaUploadManifestsMatch(a: MediaUploadManifest, b: MediaUploadManifest): boolean {
  if (a.settings !== b.settings) return false
  const keys = Object.keys(a.files)
  if (keys.length !== Object.keys(b.files).length) return false
  return keys.every((key) => a.files[key] === b.files[key])
}

export function changedSeedMediaFiles(current: MediaUploadManifest, baseline: MediaUploadManifest | null) {
  if (!baseline || current.settings !== baseline.settings) {
    return seedMediaFiles
  }
  return seedMediaFiles.filter((file) => current.files[file.key] !== baseline.files[file.key])
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

async function readRemoteManifest(cacheDir: string): Promise<MediaUploadManifest | null> {
  const filePath = path.join(cacheDir, MANIFEST_KEY)
  try {
    execFileSync(
      'npx',
      ['wrangler', 'r2', 'object', 'get', `${R2_BUCKET}/${MANIFEST_KEY}`, '--remote', '--file', filePath],
      { stdio: 'ignore' }
    )
    return readJsonFile<MediaUploadManifest>(filePath)
  } catch {
    return null
  }
}

async function writeManifest(manifest: MediaUploadManifest, cacheDir: string, log: (message: string) => void) {
  const filePath = path.join(cacheDir, MANIFEST_KEY)
  await fs.writeFile(filePath, JSON.stringify(manifest))
  wranglerR2Put(filePath, MANIFEST_KEY, 'application/json')
  log('media-variants: manifest updated on R2')
}

export async function publishSeedMediaManifest(root: string, log = console.log): Promise<void> {
  const seedDir = path.join(root, 'seed/media')
  try {
    await fs.access(seedDir)
  } catch {
    log('media-variants: no seed/media directory')
    return
  }

  const cacheDir = path.join(root, '.cache', 'media-variants')
  await fs.mkdir(cacheDir, { recursive: true })
  const current = await buildMediaUploadManifest(seedDir)
  await writeManifest(current, cacheDir, log)
}

export async function uploadSeedMediaVariants(root: string, log = console.log): Promise<void> {
  if (process.env.HWC_SKIP_MEDIA_UPLOAD === '1') {
    return
  }
  if (process.env.WORKERS_CI === '1') {
    log('media-variants: skipping R2 upload on Workers Builds (run npm run media:upload locally when seed media changes)')
    return
  }

  const seedDir = path.join(root, 'seed/media')
  try {
    await fs.access(seedDir)
  } catch {
    log('media-variants: no seed/media directory, skipping upload')
    return
  }

  const cacheDir = path.join(root, '.cache', 'media-variants')
  await fs.mkdir(cacheDir, { recursive: true })

  const current = await buildMediaUploadManifest(seedDir)
  const remote = await readRemoteManifest(cacheDir)
  const local = await readJsonFile<MediaUploadManifest>(path.join(cacheDir, MANIFEST_KEY))

  if (remote && mediaUploadManifestsMatch(current, remote)) {
    log('media-variants: seed media unchanged on R2, skipping upload')
    await fs.writeFile(path.join(cacheDir, MANIFEST_KEY), JSON.stringify(current))
    return
  }

  const baseline = remote ?? local
  const changed = changedSeedMediaFiles(current, baseline)
  if (changed.length === 0) {
    log('media-variants: nothing to upload')
    await writeManifest(current, cacheDir, log)
    return
  }

  log(`media-variants: uploading variants for ${changed.length}/${seedMediaFiles.length} seed images`)

  let uploaded = 0
  for (const file of changed) {
    const originalPath = path.join(seedDir, file.filename)
    const variants = await encodeMediaVariants(originalPath, file.key)
    for (const [key, buffer] of variants) {
      const filePath = path.join(cacheDir, key)
      await fs.writeFile(filePath, buffer)
      wranglerR2Put(filePath, key, key.endsWith('.avif') ? 'image/avif' : 'image/webp')
      uploaded += 1
    }
  }

  await writeManifest(current, cacheDir, log)
  log(`media-variants: upload complete (${uploaded} variants)`)
}
