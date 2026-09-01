export async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/admin${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers
    }
  })
}

export async function adminJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  const response = await adminFetch(path, init)
  const data = (await response.json().catch(() => null)) as T | null
  return { ok: response.ok, status: response.status, data }
}
