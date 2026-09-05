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

const MIGRATION_LEDGER = '_applied_migrations'

/** Every migration file, in the order Wrangler would apply them. */
export function migrationFiles(root = process.cwd()): string[] {
  const dir = path.join(root, 'migrations')
  return fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
}

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
}

function isAlreadyApplied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /duplicate column name|already exists|SQLITE_ERROR: .*already/i.test(message)
}

type SchemaStatement = {
  all?(): Promise<{ results: Array<{ name: string }> }>
  run?(): Promise<unknown>
}

type SchemaDb = {
  prepare(query: string): SchemaStatement
}

/**
 * Bring a local or scratch database up to the committed migrations.
 *
 * Wrangler only applies migrations to the remote database, so the local D1 that `npm run
 * dev` and the sync scripts use has to be caught up here. Applied files are recorded in a
 * ledger table instead of being guessed at column by column, so adding a migration needs
 * no matching edit in this file. Statements a database has already had applied — one
 * created before the ledger existed — are ignored rather than fatal.
 */
export async function ensureCmsSchema(db: SchemaDb, root = process.cwd()): Promise<void> {
  const dir = path.join(root, 'migrations')
  // D1's exec() takes one statement per line, so every statement goes through prepare().
  const execute = async (sql: string) => {
    await db.prepare(sql).run?.()
  }

  await execute(`CREATE TABLE IF NOT EXISTS ${MIGRATION_LEDGER} (name TEXT PRIMARY KEY)`)

  let applied = new Set<string>()
  try {
    const rows = (await db.prepare(`SELECT name FROM ${MIGRATION_LEDGER}`).all?.())?.results ?? []
    applied = new Set(rows.map((row) => row.name))
  } catch {
    // Unreadable ledger: fall through and let the already-applied guard do the work.
  }

  for (const name of migrationFiles(root)) {
    if (applied.has(name)) {
      continue
    }
    const sql = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const statement of splitSqlStatements(sql)) {
      try {
        await execute(statement)
      } catch (error) {
        if (!isAlreadyApplied(error)) {
          throw error
        }
      }
    }
    await execute(`INSERT OR IGNORE INTO ${MIGRATION_LEDGER} (name) VALUES ('${name}')`)
  }
}

export function createMemoryD1(): MemoryD1 {
  return new MemoryD1(schemaSql())
}
