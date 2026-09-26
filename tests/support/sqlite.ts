import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import type { D1Database, D1Statement } from '../../src/server/sessionStore.ts'

export function sqliteDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  const migrations = new URL('../../drizzle/', import.meta.url)
  for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'))
  class Statement implements D1Statement {
    values: unknown[] = []
    constructor(private query: string) {}
    bind(...values: unknown[]) { this.values = values; return this }
    async all<T>() { return { results: sqlite.prepare(this.query).all(...this.values as never[]) as T[] } }
    async run() { return { meta: { changes: Number(sqlite.prepare(this.query).run(...this.values as never[]).changes) } } }
  }
  const db: D1Database = {
    prepare: query => new Statement(query),
    async batch(statements) {
      sqlite.exec('BEGIN')
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results }
      catch (cause) { sqlite.exec('ROLLBACK'); throw cause }
    },
  }
  return { db, sqlite }
}
