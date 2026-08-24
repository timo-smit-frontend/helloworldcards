import { describe, expect, it } from 'vitest'
import { createSessionToken, timingSafeEqual, verifySessionToken } from './session'

describe('session tokens', () => {
  it('accepts a token signed with the env secret', async () => {
    const token = await createSessionToken('till-secret', 'sam')
    await expect(verifySessionToken('till-secret', token)).resolves.toBe('sam')
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken('till-secret', 'sam')
    await expect(verifySessionToken('other-secret', token)).resolves.toBeNull()
  })

  it('rejects a tampered token', async () => {
    const token = await createSessionToken('till-secret', 'sam')
    await expect(verifySessionToken('till-secret', `${token}x`)).resolves.toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await createSessionToken('till-secret', 'sam', Date.now() - 8 * 24 * 60 * 60 * 1000)
    await expect(verifySessionToken('till-secret', token)).resolves.toBeNull()
  })
})

describe('timingSafeEqual', () => {
  it('compares credentials without an early string match', () => {
    expect(timingSafeEqual('secret', 'secret')).toBe(true)
    expect(timingSafeEqual('secret', 'secret!')).toBe(false)
    expect(timingSafeEqual('ab', 'abc')).toBe(false)
  })
})
