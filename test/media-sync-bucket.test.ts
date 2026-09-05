import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyMediaObjectIndex, type MediaObjectIndex } from '../app/services/mediaSync'
import { syncMediaBucket, type MediaStore } from '../vite/media-sync'

const temporaryRoots: string[] = []

async function emptyRoot(): Promise<string> {
  // No seed/media on disk, so the run only has to deal with the library keys it is given.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hwc-media-test-'))
  temporaryRoots.push(root)
  return root
}

/** A bucket that cannot be listed, the way the remote one behaves over the Wrangler CLI. */
function fakeStore(initial: Record<string, Buffer> = {}): { objects: Map<string, Buffer>; store: MediaStore } {
  const objects = new Map(Object.entries(initial))
  let index: MediaObjectIndex | null = null
  return {
    objects,
    store: {
      async listKeys() {
        return null
      },
      async read(key) {
        return objects.get(key) ?? null
      },
      async put(key, bytes) {
        objects.set(key, bytes)
      },
      async delete(key) {
        objects.delete(key)
      },
      async readIndex(settings) {
        return index ?? emptyMediaObjectIndex(settings)
      },
      async writeIndex(next) {
        index = next
      }
    }
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('media bucket sync', () => {
  it('carries an image uploaded in the other environment into the bucket', async () => {
    const original = await fs.readFile(path.join(process.cwd(), 'seed/media/wooper.png'))
    const { objects, store } = fakeStore()

    const result = await syncMediaBucket({
      root: await emptyRoot(),
      store,
      mediaRowKeys: ['abc123-wooper.png'],
      target: 'remote',
      fallback: async (key) => (key === 'abc123-wooper.png' ? original : null)
    })

    expect(result.skipped).toEqual([])
    expect(result.encoded).toEqual(['abc123-wooper.png'])
    // The original itself has to land too: no seed file holds it and the bucket, which
    // cannot be listed, has never seen it.
    expect(objects.get('abc123-wooper.png')).toEqual(original)
    expect([...objects.keys()]).toContain('abc123-wooper-w400.webp')
  })

  it('reports an image no environment can supply instead of guessing', async () => {
    const { objects, store } = fakeStore()

    const result = await syncMediaBucket({
      root: await emptyRoot(),
      store,
      mediaRowKeys: ['gone.png'],
      target: 'remote',
      fallback: async () => null
    })

    expect(result.skipped).toEqual(['gone.png'])
    expect(objects.size).toBe(0)
  })
})
