import assert from 'node:assert/strict'
import test from 'node:test'
import { applySessionDraftPatches, createBlankSessionDraft, type SessionDraft, type SessionDraftSummary } from '../src/sharedSessionDrafts.ts'
import { createWorker, type SessionDraftStore, type SessionStore } from '../src/server/worker.ts'
import type { SessionPlan } from '../src/types.ts'

function request(path: string, init?: RequestInit) {
  return new Request(`https://okojitsu.test${path}`, init)
}

function memorySessionStore(): SessionStore {
  const sessions = new Map<string, SessionPlan>()
  return {
    async ensureSeedSessions() {},
    async list() { return [...sessions.values()] },
    async create(session) { if (sessions.has(session.id)) return null; sessions.set(session.id, session); return session },
    async replace(id, session) { if (!sessions.has(id)) return null; sessions.set(id, session); return session },
    async delete(id) { return sessions.delete(id) },
    async importMissing(imported) { let added = 0; for (const session of imported) if (!sessions.has(session.id)) { sessions.set(session.id, session); added += 1 }; return added },
  }
}

function memoryDraftStore(): SessionDraftStore {
  const drafts = new Map<string, SessionDraft>()
  return {
    async list() {
      return [...drafts.values()].map((draft): SessionDraftSummary => ({ id: draft.id, title: draft.session.title, updatedAt: draft.updatedAt }))
    },
    async get(id) { return drafts.get(id) ?? null },
    async create(draft) { if (drafts.has(draft.id)) return null; drafts.set(draft.id, draft); return draft },
    async replaceIfRevision(draft, expectedRevision) {
      const current = drafts.get(draft.id)
      if (!current || current.revision !== expectedRevision) return null
      const saved = { ...draft, revision: expectedRevision + 1, updatedAt: new Date().toISOString() }
      drafts.set(saved.id, saved)
      return saved
    },
    async deleteIfRevision(id, expectedRevision) {
      const draft = drafts.get(id)
      if (!draft || draft.revision !== expectedRevision) return false
      drafts.delete(id)
      return true
    },
    async delete(id) { return drafts.delete(id) },
  }
}

test('keeps a live session draft private until an admin publishes it', async () => {
  let isAdmin = false
  const worker = createWorker({
    store: memorySessionStore(),
    sessionDraftStore: memoryDraftStore(),
    seedSessions: [],
    isAdmin: async () => isAdmin,
    fetchAsset: async () => new Response('asset'),
  })
  const draft = applySessionDraftPatches(createBlankSessionDraft('draft-session'), [{ path: 'games', value: [{ gameId: 'guard-game', duration: 6 }] }])

  const forbidden = await worker.fetch(request('/api/session-drafts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
  }))
  assert.equal(forbidden.status, 401)

  isAdmin = true
  const created = await worker.fetch(request('/api/session-drafts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
  }))
  assert.equal(created.status, 201)

  const patched = await worker.fetch(request('/api/session-drafts/draft-session', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patches: [{ path: 'title', value: 'Collaborative class' }] }),
  }))
  assert.equal(patched.status, 200)

  assert.deepEqual(await (await worker.fetch(request('/api/session-drafts'))).json(), {
    drafts: [{ id: 'draft-session', title: 'Collaborative class', updatedAt: (await (await worker.fetch(request('/api/session-drafts/draft-session'))).json()).draft.updatedAt }],
  })

  const published = await worker.fetch(request('/api/session-drafts/draft-session/publish', { method: 'POST' }))
  assert.equal(published.status, 201)
  assert.equal((await published.json()).session.title, 'Collaborative class')
  assert.deepEqual(await (await worker.fetch(request('/api/session-drafts'))).json(), { drafts: [] })
  assert.equal((await (await worker.fetch(request('/api/sessions'))).json()).sessions[0].title, 'Collaborative class')
})

test('allows an administrator to discard an unfinished live session draft', async () => {
  const worker = createWorker({
    store: memorySessionStore(),
    sessionDraftStore: memoryDraftStore(),
    seedSessions: [],
    isAdmin: async () => true,
    fetchAsset: async () => new Response('asset'),
  })
  const draft = createBlankSessionDraft('discard-session')
  assert.equal((await worker.fetch(request('/api/session-drafts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
  }))).status, 201)

  assert.equal((await worker.fetch(request('/api/session-drafts/discard-session', { method: 'DELETE' }))).status, 204)
  assert.equal((await worker.fetch(request('/api/session-drafts/discard-session'))).status, 404)
  assert.deepEqual(await (await worker.fetch(request('/api/sessions'))).json(), { sessions: [] })
})
