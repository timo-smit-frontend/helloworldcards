import fs from 'node:fs'
import path from 'node:path'
import { inMemoryMarketMemory, rememberedFrom, type MarketMemory, type RememberedListing } from '../app/services/deal-finder/memory'

const MEMORY_FILE = path.join('.cache', 'deal-finder-memory.sqlite')

let opened: Promise<MarketMemory> | null = null

/**
 * The deal finder's market memory on disk: a SQLite file beside its cache, through the
 * `node:sqlite` module Node ships with, so it needs no package of its own.
 *
 * It is opened on first use and kept for the dev server's life; both marketplaces' scans
 * write to the one file. A Node without `node:sqlite` gets the in-memory store instead,
 * which forgets on restart but keeps the scan working.
 */
export function marketMemory(root = process.cwd()): MarketMemory {
  const ready = () => (opened ??= openMemory(root))
  return {
    remember: async (listings, seenAt) => (await ready()).remember(listings, seenAt),
    seenSince: async (source, since) => (await ready()).seenSince(source, since)
  }
}

async function openMemory(root: string): Promise<MarketMemory> {
  let sqlite: typeof import('node:sqlite')
  try {
    sqlite = await import('node:sqlite')
  } catch {
    console.warn('[deal-finder] This Node has no node:sqlite, so seen listings are only remembered until the dev server restarts.')
    return inMemoryMarketMemory()
  }

  const file = path.join(root, MEMORY_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new sqlite.DatabaseSync(file)
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      ask REAL NOT NULL,
      seller_ask REAL NOT NULL,
      url TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS listings_by_source_seen ON listings (source, last_seen);
  `)

  // A listing seen again keeps the day it was first seen; everything else is its latest reading.
  const upsert = db.prepare(`
    INSERT INTO listings (id, source, title, ask, seller_ask, url, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = excluded.title,
      ask = excluded.ask,
      seller_ask = excluded.seller_ask,
      url = excluded.url,
      last_seen = excluded.last_seen
  `)
  // ISO timestamps sort as text, so "seen since" is a plain comparison.
  const seen = db.prepare(`
    SELECT id, source, title, ask, seller_ask AS sellerAsk, url, first_seen AS firstSeen, last_seen AS lastSeen
    FROM listings
    WHERE source = ? AND last_seen >= ?
  `)

  return {
    async remember(listings, seenAt) {
      db.exec('BEGIN')
      try {
        for (const listing of listings) {
          const row = rememberedFrom(listing, seenAt)
          upsert.run(row.id, row.source, row.title, row.ask, row.sellerAsk, row.url, row.firstSeen, row.lastSeen)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    async seenSince(source, since) {
      return seen.all(source, since) as unknown as RememberedListing[]
    }
  }
}
