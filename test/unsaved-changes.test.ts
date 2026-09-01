import { describe, expect, it } from 'vitest'
import { hasUnsavedChanges, serializeDraft, unsavedChangesCopy } from '../app/admin/unsaved-changes'

describe('unsaved changes', () => {
  it('is not dirty until a saved baseline exists', () => {
    expect(hasUnsavedChanges(null, { title: 'Home' })).toBe(false)
  })

  it('is not dirty when the draft still matches the last save', () => {
    const draft = { title: 'Home', path: '/' }
    expect(hasUnsavedChanges(serializeDraft(draft), draft)).toBe(false)
  })

  it('is dirty after a field changes from the last save', () => {
    const baseline = serializeDraft({ title: 'Home', path: '/' })
    expect(hasUnsavedChanges(baseline, { title: 'About', path: '/' })).toBe(true)
  })

  it('names the resource in the leave confirmation', () => {
    const copy = unsavedChangesCopy('this product')
    expect(copy.title).toBe('Unsaved changes')
    expect(copy.description).toBe('Your edits to this product have not been saved. Leave without saving, or stay and finish them.')
    expect(copy.stay).toBe('Keep editing')
    expect(copy.leave).toBe('Leave without saving')
  })
})
