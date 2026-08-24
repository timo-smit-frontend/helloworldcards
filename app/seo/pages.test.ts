import { describe, expect, it } from 'vitest'
import { getIndexableSeoPages, getSeoForPath } from './pages'

describe('dashboard privacy', () => {
  it('marks /dashboard as noindex so crawlers skip it', () => {
    const seo = getSeoForPath('/dashboard/')

    expect(seo.robots).toContain('noindex')
    expect(seo.robots).toContain('nofollow')
    expect(seo.canonical).toBeNull()
  })

  it('keeps the till out of the sitemap', () => {
    expect(getIndexableSeoPages().some((page) => page.path.includes('dashboard'))).toBe(false)
  })

  it('disallows /dashboard/ in robots.txt', async () => {
    const { readFile } = await import('node:fs/promises')
    const robots = await readFile(new URL('../../public/robots.txt', import.meta.url), 'utf8')
    expect(robots).toContain('Disallow: /dashboard/')
  })
})
