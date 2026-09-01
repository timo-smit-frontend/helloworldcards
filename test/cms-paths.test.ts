import { describe, expect, it } from 'vitest'
import {
  ADMIN_HOST,
  APEX_HOST,
  adminOrigin,
  isAdminApiAllowed,
  isAdminHost,
  isLocalHost,
  isPrivateNetworkHost,
  isReservedPath,
  normalizePagePath,
  publicDashboardRedirect
} from '../worker/hosts'
import { clearSessionCookie, sessionCookie } from '../worker/session'

describe('admin host', () => {
  it('treats admin.helloworldcards.com as the CMS host', () => {
    expect(isAdminHost(ADMIN_HOST)).toBe(true)
    expect(isAdminHost(APEX_HOST)).toBe(false)
    expect(isAdminHost(`www.${APEX_HOST}`)).toBe(false)
    expect(isLocalHost('localhost')).toBe(true)
    expect(isLocalHost('127.0.0.1')).toBe(true)
    expect(isLocalHost('192.168.2.12')).toBe(true)
    expect(isPrivateNetworkHost('192.168.2.12')).toBe(true)
    expect(isPrivateNetworkHost('10.0.0.5')).toBe(true)
    expect(isPrivateNetworkHost('172.16.0.1')).toBe(true)
    expect(isPrivateNetworkHost('8.8.8.8')).toBe(false)
  })

  it('allows admin APIs on the admin host and on local Vite', () => {
    expect(isAdminApiAllowed(ADMIN_HOST)).toBe(true)
    expect(isAdminApiAllowed('localhost')).toBe(true)
    expect(isAdminApiAllowed('192.168.2.12')).toBe(true)
    expect(isAdminApiAllowed(APEX_HOST)).toBe(false)
  })

  it('sends public /dashboard and /admin visitors to the admin host', () => {
    expect(publicDashboardRedirect(new URL('https://helloworldcards.com/dashboard/'))).toBe(`https://${ADMIN_HOST}/`)
    expect(publicDashboardRedirect(new URL('https://helloworldcards.com/admin/pages/'))).toBe(`https://${ADMIN_HOST}/pages/`)
    expect(publicDashboardRedirect(new URL(`https://${ADMIN_HOST}/pages/`))).toBeNull()
    expect(adminOrigin('https:')).toBe(`https://${ADMIN_HOST}`)
  })
})

describe('CMS page paths', () => {
  it('canonicalizes paths with a leading slash and no trailing slash except home', () => {
    expect(normalizePagePath('/')).toBe('/')
    expect(normalizePagePath('/about/')).toBe('/about')
    expect(normalizePagePath('about')).toBe('/about')
    expect(normalizePagePath('/About/Us/')).toBe('/about/us')
  })

  it('reserves product details, APIs, media, and dashboard', () => {
    expect(isReservedPath('/products/mewtwo-2016-evolutions-51')).toBe(true)
    expect(isReservedPath('/products')).toBe(false)
    expect(isReservedPath('/api/public')).toBe(true)
    expect(isReservedPath('/media/hero.jpg')).toBe(true)
    expect(isReservedPath('/dashboard')).toBe(true)
    expect(isReservedPath('/about')).toBe(false)
  })
})

describe('admin session cookie', () => {
  it('scopes the cookie to the whole admin host, not /dashboard', () => {
    expect(sessionCookie('token', true)).toContain('Path=/')
    expect(sessionCookie('token', true)).not.toContain('Path=/dashboard')
    expect(clearSessionCookie(true)).toContain('Path=/')
  })
})
