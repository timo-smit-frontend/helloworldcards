import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

type D1Meta = {
  last_row_id: number
  changes: number
}

class MemoryStatement {
  constructor(
    private readonly statement: StatementSync,
    private readonly params: SQLInputValue[] = []
  ) {}

  bind(...params: SQLInputValue[]): MemoryStatement {
    return new MemoryStatement(this.statement, params)
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta: D1Meta }> {
    const results = this.statement.all(...this.params) as T[]
    return { results, success: true, meta: { last_row_id: 0, changes: 0 } }
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.statement.get(...this.params) as T | undefined) ?? null
  }

  async run(): Promise<{ success: boolean; meta: D1Meta }> {
    const result = this.statement.run(...this.params)
    return {
      success: true,
      meta: {
        last_row_id: Number(result.lastInsertRowid),
        changes: Number(result.changes)
      }
    }
  }
}

export class MemoryD1 {
  private readonly sqlite: DatabaseSync

  constructor(schemaSql: string) {
    this.sqlite = new DatabaseSync(':memory:')
    this.sqlite.exec(schemaSql)
  }

  prepare(query: string): MemoryStatement {
    return new MemoryStatement(this.sqlite.prepare(query))
  }

  async batch<T = unknown>(statements: Array<Promise<T> | MemoryStatement | { run: () => Promise<T> }>): Promise<T[]> {
    const results: T[] = []
    this.sqlite.exec('BEGIN')
    try {
      for (const statement of statements) {
        if (statement && typeof statement === 'object' && 'run' in statement) {
          results.push((await (statement as MemoryStatement).run()) as T)
        } else {
          results.push(await (statement as Promise<T>))
        }
      }
      this.sqlite.exec('COMMIT')
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
    return results
  }

  async exec(query: string): Promise<void> {
    this.sqlite.exec(query)
  }
}

export function schemaSql(root = process.cwd()): string {
  const dir = path.join(root, 'migrations')
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
    .join('\n')
}

export async function ensureCmsSchema(
  db: { prepare(query: string): { first(): Promise<unknown> }; exec?(query: string): Promise<unknown> },
  root = process.cwd()
): Promise<void> {
  const dir = path.join(root, 'migrations')
  try {
    await db.prepare('SELECT 1 FROM settings LIMIT 1').first()
  } catch {
    await db.exec?.(fs.readFileSync(path.join(dir, '0001_schema.sql'), 'utf8'))
  }
  try {
    await db.prepare('SELECT bytes FROM media LIMIT 1').first()
  } catch {
    await db.exec?.(fs.readFileSync(path.join(dir, '0002_r2_usage.sql'), 'utf8'))
  }
  try {
    await db.prepare('SELECT title FROM media LIMIT 1').first()
  } catch {
    await db.exec?.(fs.readFileSync(path.join(dir, '0003_media_copy.sql'), 'utf8'))
  }
  try {
    await db.prepare('SELECT deleted_at FROM products LIMIT 1').first()
  } catch {
    await db.exec?.(fs.readFileSync(path.join(dir, '0004_trash.sql'), 'utf8'))
  }
}

export function createMemoryD1(): MemoryD1 {
  return new MemoryD1(schemaSql())
}
