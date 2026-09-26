import assert from 'node:assert/strict'
import test from 'node:test'
import type { CategoryMeta, Game } from '../src/types.ts'
import { bulkUpdateSharedGames, createSharedCategory, createSharedGame, deleteSharedCategory, deleteSharedGame, fetchSharedGames } from '../src/gameApi.ts'

const game = { id: 'custom-turtle', title: 'Turtle Circle' } as Game
const category = { label: 'Turtle', emoji: '🐢', color: '#00ff88', description: 'Turtle games' } as CategoryMeta

test('uses same-origin shared APIs for custom games and categories', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (url === '/api/games' && !init?.method) return new Response(JSON.stringify({ games: [game], categories: { turtle: category }, deletedSeedGameIds: [], deletedCategoryIds: [] }))
    if (url === '/api/categories') return new Response(JSON.stringify({ category }), { status: 201 })
    if (url === '/api/games/bulk') return new Response(JSON.stringify({ updated: 1 }))
    return new Response(JSON.stringify({ game }), { status: 201 })
  }

  try {
    assert.deepEqual(await fetchSharedGames(), { games: [game], categories: { turtle: category }, deletedSeedGameIds: [], deletedCategoryIds: [] })
    assert.deepEqual(await createSharedGame(game), game)
    assert.deepEqual(await createSharedCategory('turtle', category), category)
    await deleteSharedGame(game.id)
    await bulkUpdateSharedGames([game])
    await deleteSharedCategory('turtle')
    assert.equal(calls[0].url, '/api/games')
    assert.equal(calls[1].init?.method, 'POST')
    assert.equal(calls[1].init?.credentials, 'same-origin')
    assert.equal(calls[2].url, '/api/categories')
    assert.equal(calls[3].url, '/api/games/custom-turtle')
    assert.equal(calls[3].init?.method, 'DELETE')
    assert.equal(calls[3].init?.credentials, 'same-origin')
    assert.equal(calls[4].url, '/api/games/bulk')
    assert.equal(calls[4].init?.method, 'PUT')
    assert.equal(calls[5].url, '/api/categories/turtle')
    assert.equal(calls[5].init?.method, 'DELETE')
  } finally {
    globalThis.fetch = originalFetch
  }
})
