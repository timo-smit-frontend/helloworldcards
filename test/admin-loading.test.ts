import { describe, expect, it } from 'vitest'
import { ADMIN_LOADING_MIN_MS, remainingLoadingHold } from '../app/admin/AdminLoading'

describe('admin loading hold', () => {
  it('holds the rest of the minimum when the session returns early', () => {
    expect(remainingLoadingHold(1_000, 1_250)).toBe(ADMIN_LOADING_MIN_MS - 250)
  })

  it('does not hold extra once the minimum has already elapsed', () => {
    expect(remainingLoadingHold(1_000, 1_000 + ADMIN_LOADING_MIN_MS)).toBe(0)
    expect(remainingLoadingHold(1_000, 1_000 + ADMIN_LOADING_MIN_MS + 400)).toBe(0)
  })
})
