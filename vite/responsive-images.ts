import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { parseRasterVariant, type ImageFormat } from '../app/services/responsiveImage'
import { findSeedMediaOriginal } from './media-variants'
import { resizeToFormat, writeProductionVariants } from './responsive-image-build'
import { uploadSeedMediaVariants } from './upload-seed-media'

const ORIGINAL_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const

async function findOriginal(publicDir: string, root: string, stem: string): Promise<string | undefined> {
  const relativeStem = stem.replace(/^\//, '')
  if (relativeStem.startsWith('media/')) {
    return findSeedMediaOriginal(path.join(root, 'seed/media'), stem)
  }

  for (const extension of ORIGINAL_EXTENSIONS) {
    const candidate = path.join(publicDir, `${relativeStem}${extension}`)
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

function contentType(format: ImageFormat): string {
  return format === 'avif' ? 'image/avif' : 'image/webp'
}

export function responsiveImagesPlugin(): Plugin {
  let publicDir = ''
  let root = ''
  let outDir = ''
  let cacheDir = ''
  const cache = new Map<string, Buffer>()

  async function variantBuffer(originalPath: string, width: number, format: ImageFormat): Promise<Buffer> {
    const key = `${originalPath}?w=${width}&f=${format}`
    const cached = cache.get(key)
    if (cached) return cached
    const buffer = await resizeToFormat(originalPath, width, format)
    cache.set(key, buffer)
    return buffer
  }

  return {
    name: 'responsive-images',
    configResolved(config) {
      publicDir = config.publicDir
      root = config.root
      outDir = path.resolve(config.root, config.build.outDir)
      cacheDir = path.resolve(config.root, '.cache', 'responsive-images')
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0]
        if (!pathname) {
          next()
          return
        }

        const variant = parseRasterVariant(decodeURIComponent(pathname))
        if (!variant) {
          next()
          return
        }

        const originalPath = await findOriginal(publicDir, root, variant.stem)
        if (!originalPath) {
          next()
          return
        }

        try {
          const body = await variantBuffer(originalPath, variant.width, variant.format)
          response.statusCode = 200
          response.setHeader('Content-Type', contentType(variant.format))
          response.end(body)
        } catch (error) {
          next(error)
        }
      })
    },
    async closeBundle() {
      if (process.env.HWC_PRERENDER === '1') {
        return
      }

      await uploadSeedMediaVariants(root)

      const imagesDir = path.join(publicDir, 'images')
      try {
        await fs.access(imagesDir)
      } catch {
        return
      }

      await writeProductionVariants({
        imagesDir,
        outImagesDir: path.join(outDir, 'images'),
        cacheDir
      })
    }
  }
}
