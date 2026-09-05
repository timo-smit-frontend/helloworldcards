import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatGeneratedFile } from '../vite/cms-sync'
import { formatSeedMediaSource, readSeedMediaDir } from '../vite/seed-media-source'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = await readSeedMediaDir(path.join(root, 'seed/media'))
await fs.writeFile(path.join(root, 'app/cms/seed-media.ts'), formatSeedMediaSource(files))
formatGeneratedFile(path.join(root, 'app/cms/seed-media.ts'))
console.log(`Wrote ${files.length} seed media files to app/cms/seed-media.ts`)
