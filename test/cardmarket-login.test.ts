import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cardmarketLoginUrl, isOffersLoginWall, readCardmarketCredentials, sessionStateFrom, type SessionSigns } from '../vite/cardmarket-login'

const roots: string[] = []

function projectWith(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-login-'))
  roots.push(root)
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), contents)
  }
  return root
}

afterEach(() => {
  delete process.env.CM_LOGIN
  delete process.env.CM_PASS
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('readCardmarketCredentials', () => {
  it('reads CM_LOGIN and CM_PASS from .env', () => {
    const root = projectWith({ '.env': 'CLOUDFLARE_ACCOUNT_ID=x\nCM_LOGIN=hwc-scanner\nCM_PASS="p#ss word"\n' })

    expect(readCardmarketCredentials(root)).toEqual({ login: 'hwc-scanner', password: 'p#ss word' })
  })

  it('falls back to .dev.vars, and lets the environment win over both', () => {
    const root = projectWith({ '.dev.vars': 'CM_LOGIN=from-dev-vars\nCM_PASS=secret\n' })
    expect(readCardmarketCredentials(root)).toEqual({ login: 'from-dev-vars', password: 'secret' })

    process.env.CM_LOGIN = 'from-env'
    expect(readCardmarketCredentials(root)).toEqual({ login: 'from-env', password: 'secret' })
  })

  it('has no account until both halves are there', () => {
    expect(readCardmarketCredentials(projectWith({ '.env': 'CM_LOGIN=hwc-scanner\nCM_PASS=\n' }))).toBeNull()
    expect(readCardmarketCredentials(projectWith({}))).toBeNull()
  })

  it('picks up credentials added after the first read', () => {
    const root = projectWith({ '.env': 'CLOUDFLARE_ACCOUNT_ID=x\n' })
    expect(readCardmarketCredentials(root)).toBeNull()

    fs.appendFileSync(path.join(root, '.env'), 'CM_LOGIN=hwc-scanner\nCM_PASS=secret\n')
    expect(readCardmarketCredentials(root)).toEqual({ login: 'hwc-scanner', password: 'secret' })
  })
})

describe('isOffersLoginWall', () => {
  it('recognises the prompt that replaced "Show more"', () => {
    expect(isOffersLoginWall('Login to see more offers')).toBe(true)
    expect(isOffersLoginWall('Log in to see more offers')).toBe(true)
  })

  it('leaves the ordinary button alone', () => {
    expect(isOffersLoginWall('Show more results')).toBe(false)
  })
})

describe('sessionStateFrom', () => {
  const none: SessionSigns = { logoutControl: false, passwordField: false, loginLink: false, loginButton: false, loginWall: false }

  it('is logged in only with a logout control', () => {
    expect(sessionStateFrom({ ...none, logoutControl: true })).toBe('in')
  })

  it('never takes a page with nothing to go on as logged in', () => {
    expect(sessionStateFrom(none)).toBe('unknown')
  })

  it('is logged out on a header that only has a "Log in" button', () => {
    expect(sessionStateFrom({ ...none, loginButton: true })).toBe('out')
  })

  it('believes the offers login wall over anything else on the page', () => {
    expect(sessionStateFrom({ ...none, logoutControl: true, loginWall: true })).toBe('out')
  })
})

describe('cardmarketLoginUrl', () => {
  it('keeps the language and game of the page', () => {
    expect(cardmarketLoginUrl('https://www.cardmarket.com/en/Pokemon/Products/Singles/Foo/Bar?language=1')).toBe(
      'https://www.cardmarket.com/en/Pokemon/Login'
    )
  })

  it('has nothing for a page outside a game', () => {
    expect(cardmarketLoginUrl('https://www.cardmarket.com/')).toBeNull()
  })
})
