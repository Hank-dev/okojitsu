import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyGameDraftPatches,
  createBlankGameDraft,
  createGameDraftFromGame,
} from '../src/sharedGameDrafts.ts'
import { D1GameDraftStore } from '../src/server/gameDraftStore.ts'
import type { D1Database, D1RunResult, D1Statement } from '../src/server/sessionStore.ts'
import type { Game } from '../src/types.ts'

const customGame: Game = {
  id: 'custom-turtle',
  title: 'Turtle Circle',
  category: 'turtle',
  source: 'custom',
  level: 'beginner',
  type: 'mixed',
  startingPosition: 'Start seated.',
  players: [
    { role: 'Player 1', objective: 'Stay compact.', winCondition: '', constraints: [] },
    { role: 'Player 2', objective: 'Create movement.', winCondition: '', constraints: [] },
  ],
  constraints: [],
  designRationale: '',
  tags: ['turtle'],
  skills: ['connection'],
  progression: null,
  sourceUrl: null,
}

type StoredDraft = {
  sourceGameId: string | null
  payloadJson: string
  revision: number
  createdAt: string
  updatedAt: string
}

class MemoryStatement implements D1Statement {
  private values: unknown[] = []

  constructor(private readonly database: MemoryD1, private readonly query: string) {}

  bind(...values: unknown[]) {
    this.values = values
    return this
  }

  async all<T>() {
    if (this.query.startsWith('SELECT id, source_game_id, payload_json, updated_at FROM game_drafts')) {
      return {
        results: [...this.database.drafts.entries()].map(([id, row]) => ({
          id,
          source_game_id: row.sourceGameId,
          payload_json: row.payloadJson,
          updated_at: row.updatedAt,
        })) as T[],
      }
    }
    if (this.query.startsWith('SELECT id, source_game_id, payload_json, revision, created_at, updated_at FROM game_drafts WHERE id = ?')) {
      const [id] = this.values as [string]
      const row = this.database.drafts.get(id)
      return {
        results: row ? [{
          id,
          source_game_id: row.sourceGameId,
          payload_json: row.payloadJson,
          revision: row.revision,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        }] as T[] : [],
      }
    }
    if (this.query.startsWith('SELECT id, source_game_id, payload_json, revision, created_at, updated_at FROM game_drafts WHERE source_game_id = ?')) {
      const [sourceGameId] = this.values as [string]
      const entry = [...this.database.drafts.entries()].find(([, candidate]) => candidate.sourceGameId === sourceGameId)
      return {
        results: entry ? [{
          id: entry[0],
          source_game_id: entry[1].sourceGameId,
          payload_json: entry[1].payloadJson,
          revision: entry[1].revision,
          created_at: entry[1].createdAt,
          updated_at: entry[1].updatedAt,
        }] as T[] : [],
      }
    }
    throw new Error(`Unexpected query: ${this.query}`)
  }

  async run(): Promise<D1RunResult> {
    if (this.query.startsWith('INSERT OR IGNORE INTO game_drafts')) {
      const [id, sourceGameId, payloadJson, revision, createdAt, updatedAt] = this.values as [string, string | null, string, number, string, string]
      if ([...this.database.drafts.entries()].some(([existingId, row]) => existingId === id || (sourceGameId !== null && row.sourceGameId === sourceGameId))) {
        return { meta: { changes: 0 } }
      }
      this.database.drafts.set(id, { sourceGameId, payloadJson, revision, createdAt, updatedAt })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('UPDATE game_drafts SET payload_json')) {
      const [payloadJson, revision, updatedAt, id, expectedRevision] = this.values as [string, number, string, string, number]
      const row = this.database.drafts.get(id)
      if (!row || row.revision !== expectedRevision) return { meta: { changes: 0 } }
      this.database.drafts.set(id, { ...row, payloadJson, revision, updatedAt })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('DELETE FROM game_drafts WHERE id = ? AND revision = ?')) {
      const [id, expectedRevision] = this.values as [string, number]
      const row = this.database.drafts.get(id)
      if (!row || row.revision !== expectedRevision) return { meta: { changes: 0 } }
      this.database.drafts.delete(id)
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('DELETE FROM game_drafts')) {
      const [id] = this.values as [string]
      return { meta: { changes: this.database.drafts.delete(id) ? 1 : 0 } }
    }
    throw new Error(`Unexpected query: ${this.query}`)
  }
}

class MemoryD1 implements D1Database {
  drafts = new Map<string, StoredDraft>()

  prepare(query: string) {
    return new MemoryStatement(this, query)
  }

  async batch(statements: D1Statement[]) {
    return Promise.all(statements.map(statement => statement.run()))
  }
}

test('returns the existing active draft for the same source game', async () => {
  const store = new D1GameDraftStore(new MemoryD1())
  const created = await store.create(createGameDraftFromGame('draft-1', customGame, 'replace'))
  const existing = await store.findBySourceGameId(customGame.id)

  assert.equal(created?.id, existing?.id)
})

test('rejects a stale revision without overwriting a newer field patch', async () => {
  const store = new D1GameDraftStore(new MemoryD1())
  const draft = await store.create(createBlankGameDraft('draft-1'))
  const first = applyGameDraftPatches(draft!, [{ path: 'title', value: 'First title' }])
  assert.ok(await store.replaceIfRevision(first, 0))

  const stale = applyGameDraftPatches(draft!, [{ path: 'source', value: 'Seminar' }])
  assert.equal(await store.replaceIfRevision(stale, 0), null)
  assert.equal((await store.get(draft!.id))?.game.title, 'First title')
  assert.equal((await store.get(draft!.id))?.game.source, '')
})

test('persists a publishing claim at its new revision', async () => {
  const store = new D1GameDraftStore(new MemoryD1())
  const draft = await store.create(createBlankGameDraft('draft-claim'))
  assert.ok(draft)

  const claimed = await store.replaceIfRevision({ ...draft, isPublishing: true }, draft.revision)

  assert.equal(claimed?.isPublishing, true)
  assert.equal((await store.get(draft.id))?.isPublishing, true)
})

test('reads a legacy D1 payload without publishing state as unclaimed', async () => {
  const database = new MemoryD1()
  const draft = createBlankGameDraft('legacy-draft')
  const { isPublishing: _, ...legacyDraft } = draft
  database.drafts.set(draft.id, {
    sourceGameId: draft.sourceGameId,
    payloadJson: JSON.stringify(legacyDraft),
    revision: draft.revision,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  })

  const stored = await new D1GameDraftStore(database).get(draft.id)

  assert.equal(stored?.isPublishing, false)
  assert.equal(stored?.id, draft.id)
})

test('does not discard a publishing claim through a stale revision', async () => {
  const store = new D1GameDraftStore(new MemoryD1())
  const draft = await store.create(createBlankGameDraft('draft-discard'))
  assert.ok(draft)
  const claimed = await store.replaceIfRevision({ ...draft, isPublishing: true }, draft.revision)
  assert.ok(claimed)

  assert.equal(await store.deleteIfRevision(draft.id, draft.revision), false)
  assert.equal((await store.get(draft.id))?.isPublishing, true)
  assert.equal(await store.deleteIfRevision(draft.id, claimed.revision), true)
})

test('summarizes and retrieves valid active drafts using stored timestamps', async () => {
  const store = new D1GameDraftStore(new MemoryD1())
  const draft = await store.create(createGameDraftFromGame('draft-1', customGame, 'replace'))
  assert.ok(draft)

  assert.deepEqual(await store.list(), [{
    id: 'draft-1',
    sourceGameId: 'custom-turtle',
    title: 'Turtle Circle',
    updatedAt: draft.updatedAt,
  }])
  assert.deepEqual(await store.get('draft-1'), draft)
  assert.equal(await store.get('missing'), null)
})

test('allows multiple new-game drafts but rejects a second active source-game draft', async () => {
  const store = new D1GameDraftStore(new MemoryD1())

  assert.ok(await store.create(createBlankGameDraft('new-1')))
  assert.ok(await store.create(createBlankGameDraft('new-2')))
  assert.ok(await store.create(createGameDraftFromGame('source-1', customGame, 'replace')))
  assert.equal(await store.create(createGameDraftFromGame('source-2', customGame, 'replace')), null)
})

test('deletes an active draft and reports whether it existed', async () => {
  const store = new D1GameDraftStore(new MemoryD1())
  await store.create(createBlankGameDraft('draft-1'))

  assert.equal(await store.delete('draft-1'), true)
  assert.equal(await store.delete('draft-1'), false)
  assert.equal(await store.get('draft-1'), null)
})
