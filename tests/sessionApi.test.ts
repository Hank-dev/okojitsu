import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionPlan } from '../src/types.ts'
import { createSharedSession, deleteSharedSession, fetchSharedSessions, importSharedSessions } from '../src/sessionApi.ts'

const session: SessionPlan = {
  id: 'session-user', title: 'Saturday class', date: '2026-08-23T12:00:00.000Z', duration: 18,
  level: 'all-levels', focus: '', notes: '', games: [{ gameId: 'guard-game', duration: 6 }],
}

test('uses the shared Sessions API with same-origin credentials', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (url === '/api/sessions' && !init?.method) return new Response(JSON.stringify({ sessions: [session] }))
    if (url === '/api/sessions/import') return new Response(JSON.stringify({ imported: 1 }))
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(JSON.stringify({ session }), { status: 201 })
  }

  try {
    assert.deepEqual(await fetchSharedSessions(), [session])
    assert.deepEqual(await createSharedSession(session), session)
    assert.deepEqual(await importSharedSessions([session]), { imported: 1 })
    await deleteSharedSession(session.id)

    assert.equal(calls.length, 4)
    assert.equal(calls[0].url, '/api/sessions')
    assert.equal(calls[1].init?.method, 'POST')
    assert.equal(calls[1].init?.credentials, 'same-origin')
    assert.equal(calls[2].url, '/api/sessions/import')
    assert.equal(calls[3].url, '/api/sessions/session-user')
    assert.equal(calls[3].init?.method, 'DELETE')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('surfaces a useful API error when shared sessions cannot be reached', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Admin sign-in required.' }), { status: 401 })

  try {
    await assert.rejects(() => createSharedSession(session), /Admin sign-in required/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
