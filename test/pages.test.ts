import { describe, expect, it } from 'vitest'
import { getIndexableSeoPages, getSeoForPath } from '~/seo/pages'

describe('admin privacy', () => {
  it('marks /dashboard as noindex so crawlers skip it', () => {
    const seo = getSeoForPath('/dashboard/')

    expect(seo.robots).toContain('noindex')
    expect(seo.robots).toContain('nofollow')
    expect(seo.canonical).toBeNull()
  })

  it('marks /admin as noindex so crawlers skip it', () => {
    const seo = getSeoForPath('/admin/')

    expect(seo.robots).toContain('noindex')
    expect(seo.robots).toContain('nofollow')
    expect(seo.canonical).toBeNull()
  })

  it('keeps the dashboard out of the sitemap', () => {
    expect(getIndexableSeoPages().some((page) => page.path.includes('dashboard'))).toBe(false)
  })

  it('disallows /dashboard/ and /admin/ in robots.txt', async () => {
    const { readFile } = await import('node:fs/promises')
    const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8')
    expect(robots).toContain('Disallow: /dashboard/')
    expect(robots).toContain('Disallow: /admin/')
  })

  it('points AI crawlers at llms.txt and the sitemap', async () => {
    const { readFile } = await import('node:fs/promises')
    const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8')
    expect(robots).toContain('https://helloworldcards.com/llms.txt')
    expect(robots).toContain('Sitemap: https://helloworldcards.com/sitemap.xml')
  })
})
