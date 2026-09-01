import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uploadSeedMediaVariants } from '../vite/upload-seed-media'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await uploadSeedMediaVariants(root)
