import { describe, expect, it } from 'vitest'
import { emptyMediaObjectIndex, expectedMediaKeys, planMediaSync, withSyncedObject, type MediaObjectIndex } from '../app/services/mediaSync'
import { allMediaVariantKeys } from '../app/services/responsiveImage'
import { upgradeMediaIndex } from '../vite/media-sync'

const SETTINGS = 'settings-v1'

function indexWith(key: string, hash: string, variants = allMediaVariantKeys(key)): MediaObjectIndex {
  return withSyncedObject(emptyMediaObjectIndex(SETTINGS), key, hash, variants)
}

describe('media sync plan', () => {
  it('encodes an image the bucket has never seen', () => {
    const plan = planMediaSync({ sources: [{ key: 'hero.jpg', hash: 'aaa' }], index: null, settings: SETTINGS })
    expect(plan.encode).toEqual(['hero.jpg'])
    expect(plan.remove).toEqual([])
  })

  it('re-encodes an image whose bytes changed', () => {
    const plan = planMediaSync({
      sources: [{ key: 'hero.jpg', hash: 'changed' }],
      index: indexWith('hero.jpg', 'aaa'),
      settings: SETTINGS
    })
    expect(plan.encode).toEqual(['hero.jpg'])
  })

  it('leaves an unchanged image alone', () => {
    const plan = planMediaSync({
      sources: [{ key: 'hero.jpg', hash: 'aaa' }],
      index: indexWith('hero.jpg', 'aaa'),
      settings: SETTINGS
    })
    expect(plan.encode).toEqual([])
    expect(plan.unchanged).toEqual(['hero.jpg'])
    expect(plan.remove).toEqual([])
  })

  it('re-encodes everything when the encoder settings change', () => {
    const plan = planMediaSync({
      sources: [{ key: 'hero.jpg', hash: 'aaa' }],
      index: indexWith('hero.jpg', 'aaa'),
      settings: 'settings-v2'
    })
    expect(plan.encode).toEqual(['hero.jpg'])
  })

  it('removes a width that is no longer built', () => {
    const retired = 'hero-w2400.webp'
    const plan = planMediaSync({
      sources: [{ key: 'hero.jpg', hash: 'aaa' }],
      index: indexWith('hero.jpg', 'aaa', [...allMediaVariantKeys('hero.jpg'), retired]),
      settings: SETTINGS
    })
    expect(plan.remove).toEqual([retired])
  })

  it('removes an image and its variants once it is gone from the sources', () => {
    const plan = planMediaSync({ sources: [], index: indexWith('gone.jpg', 'aaa'), settings: SETTINGS })
    expect(plan.remove).toEqual([...expectedMediaKeys('gone.jpg')].sort())
  })

  it('re-encodes when the bucket listing is missing a variant', () => {
    const plan = planMediaSync({
      sources: [{ key: 'hero.jpg', hash: 'aaa' }],
      index: indexWith('hero.jpg', 'aaa'),
      settings: SETTINGS,
      bucketKeys: expectedMediaKeys('hero.jpg').slice(0, -1)
    })
    expect(plan.encode).toEqual(['hero.jpg'])
  })

  it('removes orphan variants found in a real listing', () => {
    const plan = planMediaSync({
      sources: [{ key: 'hero.jpg', hash: 'aaa' }],
      index: indexWith('hero.jpg', 'aaa'),
      settings: SETTINGS,
      bucketKeys: [...expectedMediaKeys('hero.jpg'), 'deleted-w400.webp']
    })
    expect(plan.remove).toEqual(['deleted-w400.webp'])
  })

  it('never deletes the original of an admin upload it is not tracking', () => {
    const plan = planMediaSync({
      sources: [{ key: 'hero.jpg', hash: 'aaa' }],
      index: indexWith('hero.jpg', 'aaa'),
      settings: SETTINGS,
      bucketKeys: [...expectedMediaKeys('hero.jpg'), 'abc-upload.jpg', '_media-variants-manifest.json']
    })
    expect(plan.remove).toEqual([])
  })

  it('deletes nothing when the source list is only partial', () => {
    const plan = planMediaSync({
      sources: [{ key: 'hero.jpg', hash: 'aaa' }],
      index: indexWith('upload.jpg', 'bbb'),
      settings: SETTINGS,
      prune: false
    })
    expect(plan.remove).toEqual([])
  })

  it('reads a legacy manifest as a variant index so nothing is re-uploaded', () => {
    const upgraded = upgradeMediaIndex({ settings: SETTINGS, files: { 'hero.jpg': 'aaa' } }, SETTINGS)
    const plan = planMediaSync({ sources: [{ key: 'hero.jpg', hash: 'aaa' }], index: upgraded, settings: SETTINGS })
    expect(plan.encode).toEqual([])
  })
})
