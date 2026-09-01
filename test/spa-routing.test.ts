import { describe, expect, it } from 'vitest'
import { isHtmlResponse, shouldServeSpaFallback } from '../worker/spa'

describe('SPA fallback routing', () => {
  it('serves the app shell for home and other extensionless routes', () => {
    const home = new Request('https://helloworldcards.com/', { method: 'GET' })
    const about = new Request('https://helloworldcards.com/about/', {
      method: 'GET',
      headers: { 'Sec-Fetch-Mode': 'navigate' }
    })

    expect(shouldServeSpaFallback(home, '/')).toBe(true)
    expect(shouldServeSpaFallback(about, '/about/')).toBe(true)
  })

  it('does not treat static assets as SPA routes', () => {
    const asset = new Request('https://helloworldcards.com/assets/index-abc123.js', { method: 'GET' })

    expect(shouldServeSpaFallback(asset, '/assets/index-abc123.js')).toBe(false)
  })

  it('detects HTML responses for index injection', () => {
    expect(isHtmlResponse(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))).toBe(true)
    expect(isHtmlResponse(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))).toBe(false)
  })
})
