const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const SESSION_COOKIE = 'hwc_dashboard'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export function timingSafeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.max(a.byteLength, b.byteLength)
  let mismatch = a.byteLength ^ b.byteLength

  for (let i = 0; i < length; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }

  return mismatch === 0
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array | null {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))

  try {
    const binary = atob(padded + pad)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return bytesToBase64Url(new Uint8Array(signature))
}

export async function createSessionToken(secret: string, username: string, now = Date.now()): Promise<string> {
  const payload = JSON.stringify({ sub: username, exp: now + SESSION_TTL_SECONDS * 1000 })
  const encoded = bytesToBase64Url(encoder.encode(payload))
  const signature = await sign(secret, encoded)
  return `v1.${encoded}.${signature}`
}

export async function verifySessionToken(secret: string, token: string, now = Date.now()): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    return null
  }

  const expected = await sign(secret, parts[1])
  if (!timingSafeEqual(parts[2], expected)) {
    return null
  }

  const payloadBytes = base64UrlToBytes(parts[1])
  if (!payloadBytes) {
    return null
  }

  try {
    const payload = JSON.parse(decoder.decode(payloadBytes)) as { sub?: unknown; exp?: unknown }
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp <= now) {
      return null
    }
    return payload.sub
  } catch {
    return null
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = part.slice(0, separator).trim()
    if (key === name) {
      return part.slice(separator + 1).trim()
    }
  }

  return null
}

export function sessionCookie(token: string, secure: boolean): string {
  return [`${SESSION_COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${SESSION_TTL_SECONDS}`, secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0', secure ? 'Secure' : ''].filter(Boolean).join('; ')
}
