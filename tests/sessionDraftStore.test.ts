import assert from 'node:assert/strict'
import test from 'node:test'
import { applySessionDraftPatches, createBlankSessionDraft } from '../src/sharedSessionDrafts.ts'
import { D1SessionDraftStore } from '../src/server/sessionDraftStore.ts'
import type { D1Database, D1RunResult, D1Statement } from '../src/server/sessionStore.ts'

type StoredDraft = { payloadJson: string; revision: number; createdAt: string; updatedAt: string }

class Statement implements D1Statement {
  private values: unknown[] = []
  constructor(private database: Database, private query: string) {}
  bind(...values: unknown[]) { this.values = values; return this }
  async all<T>() {
    if (this.query.startsWith('SELECT id, payload_json, updated_at FROM session_drafts')) return { results: [...this.database.drafts.entries()].map(([id, row]) => ({ id, payload_json: row.payloadJson, updated_at: row.updatedAt })) as T[] }
    if (this.query.startsWith('SELECT id, payload_json, revision, created_at, updated_at FROM session_drafts WHERE id = ?')) {
      const row = this.database.drafts.get(this.values[0] as string)
      return { results: row ? [{ id: this.values[0], payload_json: row.payloadJson, revision: row.revision, created_at: row.createdAt, updated_at: row.updatedAt }] as T[] : [] }
    }
    throw new Error(`Unexpected query: ${this.query}`)
  }
  async run(): Promise<D1RunResult> {
    if (this.query.startsWith('INSERT OR IGNORE INTO session_drafts')) {
      const [id, payloadJson, revision, createdAt, updatedAt] = this.values as [string, string, number, string, string]
      if (this.database.drafts.has(id)) return { meta: { changes: 0 } }
      this.database.drafts.set(id, { payloadJson, revision, createdAt, updatedAt })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('UPDATE session_drafts SET payload_json')) {
      const [payloadJson, revision, updatedAt, id, expectedRevision] = this.values as [string, number, string, string, number]
      const current = this.database.drafts.get(id)
      if (!current || current.revision !== expectedRevision) return { meta: { changes: 0 } }
      this.database.drafts.set(id, { ...current, payloadJson, revision, updatedAt })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('DELETE FROM session_drafts WHERE id = ? AND revision = ?')) {
      const [id, revision] = this.values as [string, number]
      const current = this.database.drafts.get(id)
      if (!current || current.revision !== revision) return { meta: { changes: 0 } }
      this.database.drafts.delete(id)
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('DELETE FROM session_drafts')) return { meta: { changes: this.database.drafts.delete(this.values[0] as string) ? 1 : 0 } }
    throw new Error(`Unexpected query: ${this.query}`)
  }
}

class Database implements D1Database {
  drafts = new Map<string, StoredDraft>()
  prepare(query: string) { return new Statement(this, query) }
  async batch(statements: D1Statement[]) { return Promise.all(statements.map(statement => statement.run())) }
}

test('revision-replaces, summarizes, and deletes a stored session draft', async () => {
  const store = new D1SessionDraftStore(new Database())
  const created = await store.create(createBlankSessionDraft('draft-session'))
  assert.ok(created)
  const updated = applySessionDraftPatches(created, [{ path: 'title', value: 'Friday plan' }, { path: 'games', value: [{ gameId: 'guard-game', duration: 6 }] }])
  const saved = await store.replaceIfRevision(updated, created.revision)

  assert.equal(saved?.revision, 1)
  assert.deepEqual(await store.list(), [{ id: 'draft-session', title: 'Friday plan', updatedAt: saved!.updatedAt }])
  assert.equal(await store.replaceIfRevision(updated, created.revision), null)
  assert.equal(await store.deleteIfRevision(created.id, created.revision), false)
  assert.equal(await store.deleteIfRevision(created.id, saved!.revision), true)
})
