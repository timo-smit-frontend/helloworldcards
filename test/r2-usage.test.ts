import { describe, expect, it } from 'vitest'
import { R2_FREE_CLASS_A, R2_FREE_CLASS_B, R2_FREE_STORAGE_BYTES, r2Warnings } from '../worker/cms/r2-usage'

describe('R2 usage warnings', () => {
  it('stays quiet under half the free tier', () => {
    expect(r2Warnings(0, 0, 0)).toEqual([])
    expect(r2Warnings(R2_FREE_STORAGE_BYTES * 0.49, R2_FREE_CLASS_A * 0.49, R2_FREE_CLASS_B * 0.49)).toEqual([])
  })

  it('warns at half and alerts at 80 percent', () => {
    expect(r2Warnings(R2_FREE_STORAGE_BYTES * 0.5, 0, 0)).toEqual([
      { metric: 'storage', used: R2_FREE_STORAGE_BYTES * 0.5, limit: R2_FREE_STORAGE_BYTES, level: 'warn' }
    ])
    expect(r2Warnings(0, R2_FREE_CLASS_A * 0.8, 0)[0]).toMatchObject({ metric: 'classA', level: 'alert' })
  })
})
