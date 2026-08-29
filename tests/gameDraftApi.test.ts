import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createGameDraft,
  deleteGameDraft,
  fetchGameDraft,
  fetchGameDrafts,
  patchGameDraft,
  publishGameDraft,
} from '../src/gameDraftApi.ts'
import { createBlankGameDraft } from '../src/sharedGameDrafts.ts'

const draft = createBlankGameDraft('draft-1')
const game = { ...draft.game, id: 'custom-published' }

test('sends individual patches to the same-origin live draft endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({ draft }), { status: 200 })
  }

  try {
    await patchGameDraft('draft-1', [{ path: 'title', value: 'Turtle Circle' }])

    assert.equal(calls[0].url, '/api/game-drafts/draft-1')
    assert.equal(calls[0].init?.method, 'PATCH')
    assert.equal(calls[0].init?.credentials, 'same-origin')
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      patches: [{ path: 'title', value: 'Turtle Circle' }],
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('uses same-origin draft endpoints and response envelopes for every operation', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url) === '/api/game-drafts' && !init?.method) {
      return new Response(JSON.stringify({ drafts: [{ id: draft.id, sourceGameId: null, title: draft.game.title, updatedAt: draft.updatedAt }] }))
    }
    if (String(url).endsWith('/publish')) return new Response(JSON.stringify({ game }), { status: 201 })
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(JSON.stringify({ draft }), { status: 201 })
  }

  try {
    assert.deepEqual(await createGameDraft(draft), draft)
    assert.deepEqual(await fetchGameDrafts(), [{ id: draft.id, sourceGameId: null, title: draft.game.title, updatedAt: draft.updatedAt }])
    assert.deepEqual(await fetchGameDraft('draft 1'), draft)
    assert.deepEqual(await patchGameDraft('draft-1', [{ path: 'source', value: 'Seminar' }]), draft)
    assert.deepEqual(await publishGameDraft('draft-1'), game)
    await deleteGameDraft('draft-1')

    assert.deepEqual(calls.map(call => [call.url, call.init?.method ?? 'GET', call.init?.credentials]), [
      ['/api/game-drafts', 'POST', 'same-origin'],
      ['/api/game-drafts', 'GET', 'same-origin'],
      ['/api/game-drafts/draft%201', 'GET', 'same-origin'],
      ['/api/game-drafts/draft-1', 'PATCH', 'same-origin'],
      ['/api/game-drafts/draft-1/publish', 'POST', 'same-origin'],
      ['/api/game-drafts/draft-1', 'DELETE', 'same-origin'],
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('preserves server error messages and status codes for draft operations', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'The draft is being published.' }), { status: 409 })

  try {
    await assert.rejects(
      patchGameDraft('draft-1', [{ path: 'title', value: 'Keep typing' }]),
      error => error instanceof Error && error.message === 'The draft is being published.' && 'status' in error && error.status === 409,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
