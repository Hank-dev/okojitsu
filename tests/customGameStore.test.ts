import assert from 'node:assert/strict'
import test from 'node:test'
import { D1CustomCategoryStore, D1CustomGameStore, type D1CustomContentDatabase } from '../src/server/customGameStore.ts'
import type { CategoryMeta, Game } from '../src/types.ts'

const game: Game = {
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
  tags: ['turtle'],
  skills: ['connection'],
  progression: null,
  sourceUrl: null,
}

const turtle: CategoryMeta = {
  label: 'Turtle', emoji: '🐢', color: '#00ff88', description: 'Turtle games',
}

test('stores custom games and categories in shared D1 content tables', async () => {
  const database = new MemoryD1()
  const games = new D1CustomGameStore(database)
  const categories = new D1CustomCategoryStore(database)

  assert.deepEqual(await games.create(game), game)
  assert.equal(await games.create(game), null)
  assert.deepEqual(await games.list(), [game])
  assert.equal(await categories.upsert('turtle', turtle), turtle)
  assert.deepEqual(await categories.list(), { turtle })

  const updated = { ...game, title: 'Turtle Compass' }
  assert.deepEqual(await games.replace(game.id, updated), updated)
  assert.deepEqual(await games.list(), [updated])
  assert.equal(await games.delete(game.id), true)
  assert.deepEqual(await games.list(), [])
})

test('creates a category only when its key is still absent', async () => {
  const categories = new D1CustomCategoryStore(new MemoryD1())
  const competing = { ...turtle, label: 'Turtle Circle' }

  assert.deepEqual(await categories.createIfAbsent('turtle', turtle), turtle)
  assert.equal(await categories.createIfAbsent('turtle', competing), null)
  assert.deepEqual(await categories.list(), { turtle })

  assert.deepEqual(await categories.upsert('turtle', competing), competing)
  assert.deepEqual(await categories.list(), { turtle: competing })
})

test('rolls back a pending category when game publication fails and allows a retry', async () => {
  const database = new MemoryD1()
  const games = new D1CustomGameStore(database)
  const categories = new D1CustomCategoryStore(database)
  database.drafts.set('draft-create-retry', { revision: 4 })
  database.failAtStatement = 1
  database.failAtStatementError = new Error('UNIQUE constraint failed: custom_games.id')

  const first = await games.publishWithCategory(game, { key: 'turtle', category: turtle }, 'create', 'draft-create-retry', 4)

  assert.deepEqual(first, { kind: 'game-conflict' })
  assert.deepEqual(await categories.list(), {})
  assert.equal(database.drafts.has('draft-create-retry'), true)

  database.failAtStatement = null
  database.failAtStatementError = null
  const retry = await games.publishWithCategory(game, { key: 'turtle', category: turtle }, 'create', 'draft-create-retry', 4)

  assert.deepEqual(retry, { kind: 'saved', game })
  assert.deepEqual(await categories.list(), { turtle })
  assert.deepEqual(await games.list(), [game])
  assert.equal(database.drafts.has('draft-create-retry'), false)
})

test('rolls back a pending category when the replacement target is missing', async () => {
  const database = new MemoryD1()
  const games = new D1CustomGameStore(database)
  const categories = new D1CustomCategoryStore(database)
  database.drafts.set('draft-missing-replace', { revision: 6 })

  const result = await games.publishWithCategory(game, { key: 'turtle', category: turtle }, 'replace', 'draft-missing-replace', 6)

  assert.deepEqual(result, { kind: 'game-conflict' })
  assert.deepEqual(await categories.list(), {})
  assert.deepEqual(await games.list(), [])
  assert.equal(database.drafts.has('draft-missing-replace'), true)
})

test('does not write a category or game when the claimed draft revision was recovered', async () => {
  const database = new MemoryD1()
  const games = new D1CustomGameStore(database)
  const categories = new D1CustomCategoryStore(database)
  database.drafts.set('draft-recovered', { revision: 9 })

  const result = await games.publishWithCategory(game, { key: 'turtle', category: turtle }, 'create', 'draft-recovered', 8)

  assert.deepEqual(result, { kind: 'draft-conflict' })
  assert.deepEqual(await categories.list(), {})
  assert.deepEqual(await games.list(), [])
  assert.equal(database.drafts.get('draft-recovered')?.revision, 9)
})

test('rethrows an unknown batch error for the Worker 500 path', async () => {
  const database = new MemoryD1()
  const games = new D1CustomGameStore(database)
  const outage = new Error('D1 service unavailable')
  database.drafts.set('draft-outage', { revision: 2 })
  database.batchError = outage

  await assert.rejects(
    games.publishWithCategory(game, { key: 'turtle', category: turtle }, 'create', 'draft-outage', 2),
    error => error === outage,
  )
})

type StoredRow = { payloadJson: string; updatedAt: string }
type StoredDraft = { revision: number }

class MemoryStatement {
  private values: unknown[] = []

  constructor(private readonly database: MemoryD1, private readonly query: string) {}

  bind(...values: unknown[]) { this.values = values; return this }

  async all<T>() {
    if (this.query.startsWith('SELECT payload_json FROM custom_games')) {
      return { results: [...this.database.games.values()].map(row => ({ payload_json: row.payloadJson })) as T[] }
    }
    if (this.query.startsWith('SELECT id, payload_json FROM custom_categories')) {
      return { results: [...this.database.categories.entries()].map(([id, row]) => ({ id, payload_json: row.payloadJson })) as T[] }
    }
    if (this.query.startsWith('SELECT id FROM custom_categories WHERE id = ?')) {
      const [id] = this.values as [string]
      return { results: this.database.categories.has(id) ? [{ id }] as T[] : [] }
    }
    if (this.query.startsWith('SELECT id FROM game_drafts WHERE id = ? AND revision = ?')) {
      const [id, revision] = this.values as [string, number]
      return { results: this.database.drafts.get(id)?.revision === revision ? [{ id }] as T[] : [] }
    }
    throw new Error(`Unexpected query: ${this.query}`)
  }

  async run() {
    if (this.query.startsWith('INSERT OR IGNORE INTO custom_games')) {
      const [id, payloadJson] = this.values as [string, string]
      if (this.database.games.has(id)) return { meta: { changes: 0 } }
      this.database.games.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('UPDATE custom_games') && this.query.includes('game_drafts')) {
      const [payloadJson, , id, draftId, revision] = this.values as [string, string, string, string, number]
      if (this.database.drafts.get(draftId)?.revision !== revision || !this.database.games.has(id)) return { meta: { changes: 0 } }
      this.database.games.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('UPDATE custom_games')) {
      const [payloadJson, , id] = this.values as [string, string, string]
      if (!this.database.games.has(id)) return { meta: { changes: 0 } }
      this.database.games.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('DELETE FROM custom_games')) {
      const [id] = this.values as [string]
      return { meta: { changes: this.database.games.delete(id) ? 1 : 0 } }
    }
    if (this.query.startsWith('INSERT INTO custom_categories') && this.query.includes('SELECT') && this.query.includes('game_drafts')) {
      const [id, payloadJson, , , draftId, revision, targetGameId] = this.values as [string, string, string, string, string, number, string | undefined]
      if (this.database.drafts.get(draftId)?.revision !== revision || (targetGameId !== undefined && !this.database.games.has(targetGameId))) {
        return { meta: { changes: 0 } }
      }
      if (this.database.categories.has(id)) throw new Error('UNIQUE constraint failed: custom_categories.id')
      this.database.categories.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('INSERT INTO custom_categories') && !this.query.includes('ON CONFLICT')) {
      const [id, payloadJson] = this.values as [string, string]
      if (this.database.categories.has(id)) throw new Error('UNIQUE constraint failed: custom_categories.id')
      this.database.categories.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('INSERT INTO custom_games') && this.query.includes('SELECT') && this.query.includes('game_drafts')) {
      const [id, payloadJson, , , draftId, revision] = this.values as [string, string, string, string, string, number]
      if (this.database.drafts.get(draftId)?.revision !== revision) return { meta: { changes: 0 } }
      if (this.database.games.has(id)) throw new Error('UNIQUE constraint failed: custom_games.id')
      this.database.games.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('INSERT INTO custom_games (id, payload_json, created_at, updated_at) VALUES')) {
      const [id, payloadJson] = this.values as [string, string]
      if (this.database.games.has(id)) throw new Error('UNIQUE constraint failed: custom_games.id')
      this.database.games.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('INSERT INTO custom_games (id, payload_json, created_at, updated_at) SELECT')) {
      const [id] = this.values as [string]
      if (!this.database.games.has(id)) throw new Error('NOT NULL constraint failed: custom_games.payload_json')
      return { meta: { changes: 0 } }
    }
    if (this.query.startsWith('INSERT OR IGNORE INTO custom_categories')) {
      const [id, payloadJson] = this.values as [string, string]
      if (this.database.categories.has(id)) return { meta: { changes: 0 } }
      this.database.categories.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('INSERT INTO custom_categories')) {
      const [id, payloadJson] = this.values as [string, string]
      this.database.categories.set(id, { payloadJson, updatedAt: new Date().toISOString() })
      return { meta: { changes: 1 } }
    }
    if (this.query.startsWith('DELETE FROM game_drafts')) {
      const [id, revision, targetGameId] = this.values as [string, number, string | undefined]
      if (this.database.drafts.get(id)?.revision !== revision || (targetGameId !== undefined && !this.database.games.has(targetGameId))) {
        return { meta: { changes: 0 } }
      }
      this.database.drafts.delete(id)
      return { meta: { changes: 1 } }
    }
    throw new Error(`Unexpected query: ${this.query}`)
  }
}

class MemoryD1 implements D1CustomContentDatabase {
  games = new Map<string, StoredRow>()
  categories = new Map<string, StoredRow>()
  drafts = new Map<string, StoredDraft>()
  failAtStatement: number | null = null
  failAtStatementError: Error | null = null
  batchError: Error | null = null
  prepare(query: string) { return new MemoryStatement(this, query) }
  async batch(statements: MemoryStatement[]) {
    const games = new Map(this.games)
    const categories = new Map(this.categories)
    const drafts = new Map(this.drafts)
    try {
      if (this.batchError) throw this.batchError
      const results = []
      for (const [index, statement] of statements.entries()) {
        if (this.failAtStatement === index) throw this.failAtStatementError ?? new Error('simulated batch failure')
        results.push(await statement.run())
      }
      return results
    } catch (error) {
      this.games.clear()
      for (const [id, row] of games) this.games.set(id, row)
      this.categories.clear()
      for (const [id, row] of categories) this.categories.set(id, row)
      this.drafts.clear()
      for (const [id, row] of drafts) this.drafts.set(id, row)
      throw error
    }
  }
}
