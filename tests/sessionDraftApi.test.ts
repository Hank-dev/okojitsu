import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionDraft, deleteSessionDraft, fetchSessionDraft, fetchSessionDrafts, patchSessionDraft, publishSessionDraft } from '../src/sessionDraftApi.ts'
import { createBlankSessionDraft } from '../src/sharedSessionDrafts.ts'

const draft = createBlankSessionDraft('draft-1')
const session = { ...draft.session, games: [{ gameId: 'guard-game', duration: 6 }], duration: 6 }

test('uses same-origin session draft endpoints and envelopes for every operation', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url) === '/api/session-drafts' && !init?.method) return new Response(JSON.stringify({ drafts: [{ id: draft.id, title: draft.session.title, updatedAt: draft.updatedAt }] }))
    if (String(url).endsWith('/publish')) return new Response(JSON.stringify({ session }), { status: 201 })
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(JSON.stringify({ draft }), { status: 201 })
  }
  try {
    assert.deepEqual(await createSessionDraft(draft), draft)
    assert.deepEqual(await fetchSessionDrafts(), [{ id: draft.id, title: draft.session.title, updatedAt: draft.updatedAt }])
    assert.deepEqual(await fetchSessionDraft('draft 1'), draft)
    assert.deepEqual(await patchSessionDraft('draft-1', [{ path: 'title', value: 'Friday' }]), draft)
    assert.deepEqual(await publishSessionDraft('draft-1'), session)
    await deleteSessionDraft('draft-1')
    assert.deepEqual(calls.map(call => [call.url, call.init?.method ?? 'GET', call.init?.credentials]), [
      ['/api/session-drafts', 'POST', 'same-origin'],
      ['/api/session-drafts', 'GET', 'same-origin'],
      ['/api/session-drafts/draft%201', 'GET', 'same-origin'],
      ['/api/session-drafts/draft-1', 'PATCH', 'same-origin'],
      ['/api/session-drafts/draft-1/publish', 'POST', 'same-origin'],
      ['/api/session-drafts/draft-1', 'DELETE', 'same-origin'],
    ])
  } finally { globalThis.fetch = originalFetch }
})

test('preserves server errors from a session draft operation', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'The draft is being published.' }), { status: 409 })
  try {
    await assert.rejects(patchSessionDraft('draft-1', [{ path: 'title', value: 'Keep typing' }]), error => error instanceof Error && error.message === 'The draft is being published.' && 'status' in error && error.status === 409)
  } finally { globalThis.fetch = originalFetch }
})
