import assert from 'node:assert/strict'
import test from 'node:test'
import { D1SessionStore, type D1Database, type D1RunResult, type D1Statement } from '../src/server/sessionStore.ts'
import type { SessionPlan } from '../src/types.ts'

const seedSession: SessionPlan = {
  id: 'seed-fundamentals', title: 'Fundamentals', date: '2026-08-23T10:00:00.000Z', duration: 36,
  level: 'beginner', focus: '', notes: '', games: [],
}

type StoredSession = { payloadJson: string; isSeed: number }

class MemoryStatement implements D1Statement {
  private values: unknown[] = []

  constructor(private readonly database: MemoryD1, private readonly query: string) {}

  bind(...values: unknown[]) {
    this.values = values
    return this
  }

  async all<T>() {
    if (this.query.startsWith('SELECT key FROM session_bootstrap')) {
      return { results: (this.database.bootstrapped ? [{ key: 'seed-sessions-v1' }] : []) as T[] }
    }
    if (this.query.startsWith('SELECT payload_json FROM sessions')) {
      return { results: [...this.database.sessions.values()].map(row => ({ payload_json: row.payloadJson })) as T[] }
    }
    throw new Error(`Unexpected query: ${this.query}`)
  }

  async run(): Promise<D1RunResult> {
    if (this.query.startsWith('INSERT OR IGNORE INTO sessions')) {
      const [id, payloadJson, isSeed] = this.values as [string, string, number]
      if (this.database.sessions.has(id)) return { meta: { changes: 0 } }
      this.database.sessions.set(id, { payloadJson, isSeed })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('INSERT OR IGNORE INTO session_bootstrap')) {
      if (this.database.bootstrapped) return { meta: { changes: 0 } }
      this.database.bootstrapped = true
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('DELETE FROM sessions')) {
      const [id] = this.values as [string]
      return { meta: { changes: this.database.sessions.delete(id) ? 1 : 0 } }
    }
    throw new Error(`Unexpected query: ${this.query}`)
  }
}

class MemoryD1 implements D1Database {
  bootstrapped = false
  sessions = new Map<string, StoredSession>()

  prepare(query: string) {
    return new MemoryStatement(this, query)
  }

  async batch(statements: D1Statement[]) {
    return Promise.all(statements.map(statement => statement.run()))
  }
}

test('does not recreate a globally deleted seed after bootstrap completes', async () => {
  const store = new D1SessionStore(new MemoryD1())

  await store.ensureSeedSessions([seedSession])
  assert.deepEqual((await store.list()).map(session => session.id), ['seed-fundamentals'])

  assert.equal(await store.delete(seedSession.id), true)
  await store.ensureSeedSessions([seedSession])
  assert.deepEqual(await store.list(), [])
})
