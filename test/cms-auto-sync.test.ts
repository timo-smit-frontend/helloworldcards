import { describe, expect, it } from 'vitest'
import { decideSync } from '../vite/cms-auto-sync'
import type { CmsSeedFiles } from '../vite/cms-state'

const synced: CmsSeedFiles = { content: 'content', products: 'products', media: 'media' }

describe('deciding what to sync', () => {
  it('does nothing while both sides match what was last synced', () => {
    expect(decideSync(synced, synced, synced).action).toBe('idle')
  })

  it('publishes a local edit', () => {
    const decision = decideSync(synced, { ...synced, content: 'edited' }, synced)
    expect(decision.action).toBe('publish')
    expect(decision.localAhead).toEqual(['content'])
  })

  it('adopts an edit made in the production admin', () => {
    const decision = decideSync(synced, synced, { ...synced, media: 'uploaded' })
    expect(decision.action).toBe('adopt')
    expect(decision.remoteAhead).toEqual(['media'])
  })

  it('keeps the local version when both admins were used, and says what it overwrites', () => {
    const decision = decideSync(synced, { ...synced, content: 'local' }, { ...synced, content: 'production' })
    expect(decision.action).toBe('overwrite')
    expect(decision.remoteAhead).toEqual(['content'])
  })

  /** A missing file reads as undefined, which must count as a difference, not a match. */
  it('treats a seed file that does not exist yet as out of date', () => {
    expect(decideSync({}, synced, synced).action).toBe('publish')
  })
})
