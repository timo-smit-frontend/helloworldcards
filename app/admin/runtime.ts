export const ADMIN_HOST = 'admin.helloworldcards.com'

export function isAdminHost(hostname: string): boolean {
  return hostname === ADMIN_HOST
}

export function isAdminPath(pathname: string, hostname: string): boolean {
  return isAdminHost(hostname) || pathname === '/admin' || pathname.startsWith('/admin/')
}

export function adminPrefix(hostname = typeof window === 'undefined' ? '' : window.location.hostname): string {
  return isAdminHost(hostname) ? '' : '/admin'
}

export function adminTo(path: string, hostname?: string): string {
  const prefix = adminPrefix(hostname)
  if (path === '/') {
    return prefix || '/'
  }
  return `${prefix}${path}`
}
