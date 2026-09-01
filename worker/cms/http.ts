export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...headers
    }
  })
}

export function normalizeApiPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export async function readJson<T>(request: Request, maxBytes = 1024 * 512): Promise<T | null> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > maxBytes) {
    return null
  }

  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export function newBlockId(): string {
  return `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
