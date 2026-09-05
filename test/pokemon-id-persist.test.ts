import { describe, expect, it } from 'vitest'
import { handleAdminRequest } from '../worker/cms/admin-api'
import { SESSION_COOKIE } from '../worker/session'
import { createMemoryD1 } from './helpers/memory-d1'
import type { CmsDb } from '../worker/cms/db'
import type { InventoryProduct } from '../app/database/products'

const env = {
  DASHBOARD_USERNAME: 'sam',
  DASHBOARD_PASSWORD: 'correct-horse',
  DASHBOARD_SESSION_SECRET: 'session-secret-for-tests'
}

const ADMIN = 'https://admin.helloworldcards.com'

async function signIn(db: CmsDb): Promise<string> {
  const login = await handleAdminRequest(
    new Request(`${ADMIN}/api/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
    }),
    env,
    { db }
  )
  const header = login!.headers.get('Set-Cookie') ?? ''
  return header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1] ?? ''
}

describe('product pokemonId', () => {
  it('persists when sent on PUT', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const { products } = (await listed!.json()) as { products: InventoryProduct[] }
    const mewtwo = products.find((product) => product.title === 'Mewtwo')!

    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ ...mewtwo, pokemonId: 150 })
      }),
      env,
      { db }
    )

    const loaded = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const body = (await loaded!.json()) as { product: InventoryProduct }
    expect(body.product.pokemonId).toBe(150)
  })

  it('survives a partial PUT that omits pokemonId after it was set', async () => {
    const db = createMemoryD1()
    const token = await signIn(db as unknown as CmsDb)
    const listed = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const { products } = (await listed!.json()) as { products: InventoryProduct[] }
    const mewtwo = products.find((product) => product.title === 'Mewtwo')!

    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ ...mewtwo, pokemonId: 150 })
      }),
      env,
      { db }
    )

    await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({
          id: mewtwo.id,
          title: mewtwo.title,
          subtitle: mewtwo.subtitle,
          description: mewtwo.description,
          images: mewtwo.images
        })
      }),
      env,
      { db }
    )

    const loaded = await handleAdminRequest(
      new Request(`${ADMIN}/api/admin/products/${mewtwo.id}`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      env,
      { db }
    )
    const body = (await loaded!.json()) as { product: InventoryProduct }
    expect(body.product.pokemonId).toBe(150)
  })
})
