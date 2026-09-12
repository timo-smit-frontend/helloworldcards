import { describe, expect, it } from 'vitest'
import { decideSync, syncFailureMessage } from '../vite/cms-auto-sync'
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

describe('naming a sync failure', () => {
  const crash = {
    message: 'Command failed: npx wrangler d1 execute helloworldcards --remote --json --command SELECT id, name FROM media_folders'
  }

  it('points at the migration when production is behind the schema', () => {
    const stdout = '{ "error": { "notes": [ { "text": "no such table: media_folders: SQLITE_ERROR [code: 7500]" } ] } }'
    expect(syncFailureMessage(crash, stdout, 'Error: Command failed ...\n    at genericNodeError')).toBe(
      'production database has no table media_folders yet — run `npm run migrate:remote` to apply the committed migrations, or deploy'
    )
    expect(syncFailureMessage(crash, '', '✘ [ERROR] no such column: folder_id: SQLITE_ERROR')).toContain('no column folder_id yet')
  })

  it('passes any other failure through with what the child wrote', () => {
    expect(syncFailureMessage({ message: 'Command failed: npx vite-node' }, '', 'TypeError: boom\n')).toBe(
      'Command failed: npx vite-node\nTypeError: boom'
    )
  })
})
