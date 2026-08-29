import assert from 'node:assert/strict'
import test from 'node:test'
import type { CategoryMeta, Game } from '../src/types.ts'
import { createWorker, type CategoryStore, type CustomGameStore, type DeletedSeedGameStore } from '../src/server/worker.ts'

const game: Game = {
  id: 'custom-turtle', title: 'Turtle Circle', category: 'turtle', source: 'custom', level: 'beginner', type: 'mixed',
  startingPosition: 'Start seated.',
  players: [
    { role: 'Player 1', objective: 'Stay compact.', winCondition: '', constraints: [] },
    { role: 'Player 2', objective: 'Create movement.', winCondition: '', constraints: [] },
  ],
  constraints: [], tags: ['turtle'], skills: ['connection'], progression: null, sourceUrl: null,
}
const category = { label: 'Turtle', emoji: '🐢', color: '#00ff88', description: 'Turtle games' } as CategoryMeta

function request(path: string, init?: RequestInit) {
  return new Request(`https://okojitsu.test${path}`, init)
}

test('serves custom games and categories publicly while protecting writes', async () => {
  let isAdmin = false
  const storedGames = new Map<string, Game>()
  const storedCategories: Record<string, CategoryMeta> = {}
  const deletedSeedGameIds = new Set<string>()
  const worker = createWorker({
    store: { ensureSeedSessions: async () => {}, list: async () => [], create: async () => null, replace: async () => null, delete: async () => false, importMissing: async () => 0 },
    gameStore: {
      async list() { return [...storedGames.values()] },
      async create(value) { if (storedGames.has(value.id)) return null; storedGames.set(value.id, value); return value },
      async replace(id, value) { if (!storedGames.has(id)) return null; storedGames.set(id, value); return value },
      async publishWithCategory(value, pendingCategory, mode) {
        if (Object.hasOwn(storedCategories, pendingCategory.key)) return { kind: 'category-conflict' as const }
        if (mode === 'create' && storedGames.has(value.id)) return { kind: 'game-conflict' as const }
        if (mode === 'replace' && !storedGames.has(value.id)) return { kind: 'game-conflict' as const }
        storedCategories[pendingCategory.key] = pendingCategory.category
        storedGames.set(value.id, value)
        return { kind: 'saved' as const, game: value }
      },
      async publishWithoutCategory(value, mode) {
        if (mode === 'create' && storedGames.has(value.id)) return { kind: 'game-conflict' as const }
        if (mode === 'replace' && !storedGames.has(value.id)) return { kind: 'game-conflict' as const }
        storedGames.set(value.id, value)
        return { kind: 'saved' as const, game: value }
      },
      async delete(id) { return storedGames.delete(id) },
      async importMissing(values) { let count = 0; for (const value of values) if (!storedGames.has(value.id)) { storedGames.set(value.id, value); count += 1 }; return count },
    } satisfies CustomGameStore,
    categoryStore: {
      async list() { return storedCategories },
      async upsert(key, value) { storedCategories[key] = value; return value },
      async createIfAbsent(key, value) {
        if (Object.hasOwn(storedCategories, key)) return null
        storedCategories[key] = value
        return value
      },
    } satisfies CategoryStore,
    deletedSeedGameStore: {
      async list() { return [...deletedSeedGameIds] },
      async add(id) { deletedSeedGameIds.add(id) },
    } satisfies DeletedSeedGameStore,
    seedSessions: [],
    isAdmin: async () => isAdmin,
    fetchAsset: async () => new Response('asset'),
  })

  const initial = await worker.fetch(request('/api/games'))
  assert.equal(initial.status, 200)
  assert.deepEqual(await initial.json(), { games: [], categories: {}, deletedSeedGameIds: [] })

  const forbidden = await worker.fetch(request('/api/games', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(game),
  }))
  assert.equal(forbidden.status, 401)

  isAdmin = true
  const created = await worker.fetch(request('/api/games', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(game),
  }))
  assert.equal(created.status, 201)

  const categoryResponse = await worker.fetch(request('/api/categories', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'turtle', category }),
  }))
  assert.equal(categoryResponse.status, 201)
  assert.deepEqual(await (await worker.fetch(request('/api/games'))).json(), { games: [game], categories: { turtle: category }, deletedSeedGameIds: [] })

  const deletedSeed = await worker.fetch(request('/api/games/beginner-feet-off', { method: 'DELETE' }))
  assert.equal(deletedSeed.status, 204)
  assert.deepEqual(await (await worker.fetch(request('/api/games'))).json(), {
    games: [game], categories: { turtle: category }, deletedSeedGameIds: ['beginner-feet-off'],
  })
})
