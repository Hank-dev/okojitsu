import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionPlan } from '../src/types.ts'
import { createWorker, type SessionStore } from '../src/server/worker.ts'

const seedSession: SessionPlan = {
  id: 'seed-fundamentals',
  title: 'Fundamentals',
  date: '2026-08-23T10:00:00.000Z',
  duration: 36,
  level: 'beginner',
  focus: '',
  notes: '',
  games: [],
}

const userSession: SessionPlan = {
  id: 'session-user',
  title: 'Saturday class',
  date: '2026-08-23T12:00:00.000Z',
  duration: 18,
  level: 'all-levels',
  focus: 'Guard passing',
  notes: 'Keep it playful.',
  games: [{ gameId: 'guard-game', duration: 6 }],
}

function createMemoryStore(): SessionStore {
  let seeded = false
  const sessions = new Map<string, SessionPlan>()

  return {
    async ensureSeedSessions(seedSessions) {
      if (seeded) return
      seeded = true
      for (const session of seedSessions) sessions.set(session.id, session)
    },
    async list() {
      return [...sessions.values()]
    },
    async create(session) {
      if (sessions.has(session.id)) return null
      sessions.set(session.id, session)
      return session
    },
    async replace(id, session) {
      if (!sessions.has(id)) return null
      sessions.set(id, session)
      return session
    },
    async delete(id) {
      return sessions.delete(id)
    },
    async importMissing(imported) {
      let importedCount = 0
      for (const session of imported) {
        if (sessions.has(session.id)) continue
        sessions.set(session.id, session)
        importedCount += 1
      }
      return importedCount
    },
  }
}

function request(path: string, init?: RequestInit) {
  return new Request(`https://okojitsu.test${path}`, init)
}

test('serves the shared class list publicly and protects edits behind admin access', async () => {
  let isAdmin = false
  const worker = createWorker({
    store: createMemoryStore(),
    seedSessions: [seedSession],
    isAdmin: async () => isAdmin,
    fetchAsset: async () => new Response('asset'),
  })

  const initial = await worker.fetch(request('/api/sessions'))
  assert.equal(initial.status, 200)
  assert.deepEqual((await initial.json()).sessions.map((session: SessionPlan) => session.id), ['seed-fundamentals'])

  const forbidden = await worker.fetch(request('/api/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userSession),
  }))
  assert.equal(forbidden.status, 401)

  isAdmin = true
  const created = await worker.fetch(request('/api/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userSession),
  }))
  assert.equal(created.status, 201)
  assert.deepEqual((await created.json()).session, userSession)

  const imported = await worker.fetch(request('/api/sessions/import', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessions: [userSession] }),
  }))
  assert.deepEqual(await imported.json(), { imported: 0 })
})

test('keeps a deleted seed deleted and rejects invalid replacement ids', async () => {
  const worker = createWorker({
    store: createMemoryStore(),
    seedSessions: [seedSession],
    isAdmin: async () => true,
    fetchAsset: async () => new Response('asset'),
  })

  const deleted = await worker.fetch(request('/api/sessions/seed-fundamentals', { method: 'DELETE' }))
  assert.equal(deleted.status, 204)
  assert.deepEqual((await (await worker.fetch(request('/api/sessions'))).json()).sessions, [])

  const mismatchedId = await worker.fetch(request('/api/sessions/seed-fundamentals', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userSession),
  }))
  assert.equal(mismatchedId.status, 400)
})
