import { isSessionPlan } from '../sharedSessions'
import type { SessionPlan } from '../types'

export interface D1RunResult {
  meta?: { changes?: number }
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<D1RunResult>
}

export interface D1Database {
  prepare(query: string): D1Statement
  batch(statements: D1Statement[]): Promise<D1RunResult[]>
}

export interface SessionStore {
  ensureSeedSessions(seedSessions: SessionPlan[]): Promise<void>
  list(): Promise<SessionPlan[]>
  create(session: SessionPlan): Promise<SessionPlan | null>
  replace(id: string, session: SessionPlan): Promise<SessionPlan | null>
  delete(id: string): Promise<boolean>
  importMissing(sessions: SessionPlan[]): Promise<number>
}

const SEED_BOOTSTRAP_KEY = 'seed-sessions-v1'

type PayloadRow = { payload_json: string }
type BootstrapRow = { key: string }

function now() {
  return new Date().toISOString()
}

function changes(result: D1RunResult) {
  return Number(result.meta?.changes ?? 0)
}

function payload(session: SessionPlan) {
  return JSON.stringify(session)
}

function parsePayload(value: string): SessionPlan | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return isSessionPlan(parsed) ? parsed : null
  } catch {
    return null
  }
}

export class D1SessionStore implements SessionStore {
  constructor(private readonly db: D1Database) {}

  async ensureSeedSessions(seedSessions: SessionPlan[]) {
    const bootstrap = await this.db
      .prepare('SELECT key FROM session_bootstrap WHERE key = ? LIMIT 1')
      .bind(SEED_BOOTSTRAP_KEY)
      .all<BootstrapRow>()

    if (bootstrap.results.length > 0) return

    const timestamp = now()
    const statements = seedSessions.map((session) => this.db
      .prepare('INSERT OR IGNORE INTO sessions (id, payload_json, is_seed, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(session.id, payload(session), 1, timestamp, timestamp))
    statements.push(this.db
      .prepare('INSERT OR IGNORE INTO session_bootstrap (key, completed_at) VALUES (?, ?)')
      .bind(SEED_BOOTSTRAP_KEY, timestamp))

    await this.db.batch(statements)
  }

  async list() {
    const result = await this.db
      .prepare('SELECT payload_json FROM sessions ORDER BY is_seed ASC, updated_at DESC')
      .all<PayloadRow>()

    return result.results.flatMap((row) => {
      const session = parsePayload(row.payload_json)
      return session ? [session] : []
    })
  }

  async create(session: SessionPlan) {
    const timestamp = now()
    const result = await this.db
      .prepare('INSERT OR IGNORE INTO sessions (id, payload_json, is_seed, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(session.id, payload(session), 0, timestamp, timestamp)
      .run()

    return changes(result) > 0 ? session : null
  }

  async replace(id: string, session: SessionPlan) {
    const result = await this.db
      .prepare('UPDATE sessions SET payload_json = ?, updated_at = ? WHERE id = ?')
      .bind(payload(session), now(), id)
      .run()

    return changes(result) > 0 ? session : null
  }

  async delete(id: string) {
    const result = await this.db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()
    return changes(result) > 0
  }

  async importMissing(sessions: SessionPlan[]) {
    if (sessions.length === 0) return 0

    const timestamp = now()
    const results = await this.db.batch(sessions.map((session) => this.db
      .prepare('INSERT OR IGNORE INTO sessions (id, payload_json, is_seed, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(session.id, payload(session), 0, timestamp, timestamp)))

    return results.reduce((total, result) => total + changes(result), 0)
  }
}
