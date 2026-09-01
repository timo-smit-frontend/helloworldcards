export const APEX_HOST = 'helloworldcards.com'
export const ADMIN_HOST = `admin.${APEX_HOST}`

export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function isAdminHost(hostname: string): boolean {
  return hostname === ADMIN_HOST
}

export function isAdminApiAllowed(hostname: string): boolean {
  return isAdminHost(hostname) || isLocalHost(hostname)
}

export function adminOrigin(protocol: string): string {
  return `${protocol}//${ADMIN_HOST}`
}

export function publicDashboardRedirect(url: URL): string | null {
  if (isAdminHost(url.hostname) || isLocalHost(url.hostname)) {
    return null
  }

  const path = url.pathname
  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return `${adminOrigin(url.protocol)}/`
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    const rest = path === '/admin' || path === '/admin/' ? '/' : path.slice('/admin'.length)
    return `${adminOrigin(url.protocol)}${rest.endsWith('/') || rest.includes('.') ? rest : `${rest}/`}`
  }

  return null
}

export function normalizePagePath(input: string): string {
  const trimmed = input.trim()
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const [withoutQuery] = withSlash.split(/[?#]/)
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  if (collapsed === '' || collapsed === '/') {
    return '/'
  }

  return collapsed.toLowerCase()
}

export function isReservedPath(path: string): boolean {
  const normalized = normalizePagePath(path)
  if (normalized === '/dashboard' || normalized.startsWith('/dashboard/')) {
    return true
  }
  if (normalized === '/api' || normalized.startsWith('/api/')) {
    return true
  }
  if (normalized === '/media' || normalized.startsWith('/media/')) {
    return true
  }
  if (normalized.startsWith('/products/')) {
    return true
  }
  if (normalized === '/admin' || normalized.startsWith('/admin/')) {
    return true
  }

  return false
}
