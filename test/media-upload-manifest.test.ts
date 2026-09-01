import { describe, expect, it } from 'vitest'
import {
  buildMediaUploadManifest,
  changedSeedMediaFiles,
  mediaUploadManifestsMatch,
  type MediaUploadManifest
} from '../vite/upload-seed-media'

function manifest(overrides: Partial<MediaUploadManifest> = {}): MediaUploadManifest {
  return {
    settings: 'settings-v1',
    files: {
      'hero.jpg': 'aaa',
      'wooper.png': 'bbb'
    },
    ...overrides
  }
}

describe('media upload manifest', () => {
  it('matches when settings and file hashes are unchanged', () => {
    const left = manifest()
    const right = manifest()
    expect(mediaUploadManifestsMatch(left, right)).toBe(true)
  })

  it('does not match when settings change', () => {
    expect(mediaUploadManifestsMatch(manifest(), manifest({ settings: 'settings-v2' }))).toBe(false)
  })

  it('does not match when a seed file hash changes', () => {
    expect(
      mediaUploadManifestsMatch(
        manifest(),
        manifest({ files: { 'hero.jpg': 'changed', 'wooper.png': 'bbb' } })
      )
    ).toBe(false)
  })

  it('uploads all seed files when there is no baseline manifest', () => {
    expect(changedSeedMediaFiles(manifest(), null).length).toBeGreaterThan(0)
  })

  it('uploads only changed seed files when settings are stable', () => {
    const current = manifest({ files: { 'hero.jpg': 'changed', 'wooper.png': 'bbb' } })
    const changed = changedSeedMediaFiles(current, manifest())
    expect(changed.map((file) => file.key)).toEqual(['hero.jpg'])
  })

  it('builds a manifest from seed media on disk', async () => {
    const built = await buildMediaUploadManifest('seed/media')
    expect(built.settings.length).toBeGreaterThan(0)
    expect(built.files['hero.jpg']).toMatch(/^[a-f0-9]{16}$/)
  })
})
