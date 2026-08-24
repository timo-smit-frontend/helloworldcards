import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { handleDashboardRequest, isDashboardApiPath } from '../worker/dashboard-api'
import { stripProductCosts } from './strip-product-costs'

function parseDotEnv(source: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

export function loadDashboardEnv(root = process.cwd()): {
  DASHBOARD_USERNAME?: string
  DASHBOARD_PASSWORD?: string
  DASHBOARD_SESSION_SECRET?: string
} {
  const filePath = path.join(root, '.dev.vars')
  const fromFile = fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath, 'utf8')) : {}

  return {
    DASHBOARD_USERNAME: process.env.DASHBOARD_USERNAME ?? fromFile.DASHBOARD_USERNAME,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD ?? fromFile.DASHBOARD_PASSWORD,
    DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET ?? fromFile.DASHBOARD_SESSION_SECRET
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') {
    return undefined
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks)
}

async function toFetchRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const headers = new Headers()

  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null) {
      continue
    }
    headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }

  const body = await readBody(req)
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers
  }

  if (body && body.length > 0) {
    init.body = new Uint8Array(body)
    init.duplex = 'half'
  }

  return new Request(url, init)
}

async function sendFetchResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status

  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies)
  }

  response.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') {
      return
    }
    res.setHeader(name, value)
  })

  res.end(Buffer.from(await response.arrayBuffer()))
}

function dashboardApiMiddleware(root: string) {
  const env = loadDashboardEnv(root)

  return async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    try {
      const url = req.url?.split('?')[0] ?? ''
      if (!isDashboardApiPath(url)) {
        next()
        return
      }

      const request = await toFetchRequest(req)
      const response = await handleDashboardRequest(request, env)
      if (!response) {
        next()
        return
      }

      await sendFetchResponse(response, res)
    } catch (error) {
      next(error)
    }
  }
}

export function dashboardApiPlugin(): Plugin {
  return {
    name: 'dashboard-api',
    configureServer(server) {
      server.middlewares.use(dashboardApiMiddleware(server.config.root))
    },
    configurePreviewServer(server) {
      server.middlewares.use(dashboardApiMiddleware(server.config.root))
    }
  }
}

export function stripProductCostsPlugin(): Plugin {
  return {
    name: 'strip-product-costs',
    enforce: 'pre',
    transform(code, id, options) {
      if (options?.ssr || process.env.VITEST) {
        return
      }

      if (!id.replace(/\\/g, '/').endsWith('/app/database/products.ts')) {
        return
      }

      return {
        code: stripProductCosts(code),
        map: null
      }
    }
  }
}
