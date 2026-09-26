import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../src/server/worker.ts'
import { D1AccountStore, authenticatedIdentity } from '../src/server/accountStore.ts'
import { createBlankSessionDraft, createSessionDraftFromSession } from '../src/sharedSessionDrafts.ts'
import { sqliteDatabase } from './support/sqlite.ts'
import { PasswordAuth } from '../src/server/passwordAuth.ts'

function setup() {
  const { db, sqlite } = sqliteDatabase()
  const accounts = new D1AccountStore(db)
  const env = { DB: db, ADMIN_PASSWORD: 'test-only-password', ADMIN_SESSION_SECRET: 'test-only-secret', ASSETS: { fetch: async () => new Response('asset') } }
  async function call(path: string, { id, method = 'GET', body, cookie, origin }: { id?: string; method?: string; body?: unknown; cookie?: string; origin?: string } = {}) {
    const headers = new Headers()
    if (id) { headers.set('oai-authenticated-user-id', id); headers.set('oai-authenticated-user-email', `${id}@example.test`) }
    if (body !== undefined) headers.set('content-type', 'application/json')
    if (cookie) headers.set('cookie', cookie)
    if (origin) headers.set('origin', origin)
    return worker.fetch(new Request(`https://okojitsu.test${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env)
  }
  async function member(id: string, role: 'admin' | 'coach' = 'coach') {
    await accounts.request({ id, email: `${id}@example.test`, name: id })
    assert.equal(await accounts.update(id, role, 'active'), true)
  }
  return { db, sqlite, accounts, call, member }
}

test('personal admin setup retires the shared password permanently after two password-enabled admins', async () => {
  const { call, accounts, db } = setup()
  const login = await call('/api/admin/sign-in', { method: 'POST', body: { password: 'test-only-password' } })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')!.split(';')[0]
  const auth = new PasswordAuth(db)
  const first = await accounts.createInvited('First', 'first@example.test', 'admin')
  await auth.accept(await auth.invite(first.id), 'a long first test password', 'First')
  assert.equal((await accounts.get(first.id))?.role, 'admin')
  assert.equal(await accounts.legacyEnabled(), true)
  const second = await accounts.createInvited('Second', 'second@example.test', 'admin')
  await auth.accept(await auth.invite(second.id), 'a long second test password', 'Second')
  assert.equal(await accounts.legacyEnabled(), false)
  assert.equal((await call('/api/admin/sign-in', { method: 'POST', body: { password: 'test-only-password' } })).status, 403)
  assert.equal((await (await call('/api/admin/session', { cookie })).json()).isAdmin, false)
  assert.equal((await call('/api/account/bootstrap', { id: 'third', cookie, method: 'POST' })).status, 410)
  assert.equal(await accounts.update(second.id, 'coach', 'active'), true)
  assert.equal(await accounts.legacyEnabled(), false)
  assert.equal(await accounts.update(first.id, 'coach', 'active'), false)
  assert.equal(await accounts.update(first.id, 'admin', 'disabled'), false)
})

test('sign-in does not grant membership, approval and deactivation take effect on the next request', async () => {
  const { call, member, accounts } = setup()
  await member('admin', 'admin')
  assert.equal((await call('/api/account/request', { method: 'POST' })).status, 410)
  await accounts.request({ id: 'coach', name: 'Coach', email: 'coach@example.test' })
  assert.equal((await call('/api/session-drafts', { id: 'coach' })).status, 403)
  assert.equal((await call('/api/accounts', { id: 'coach' })).status, 403)
  assert.equal((await call('/api/accounts', { id: 'coach', method: 'PATCH', body: { id: 'coach', role: 'admin', status: 'active' } })).status, 403)
  assert.equal((await call('/api/accounts', { id: 'admin', method: 'PATCH', body: { id: 'coach', role: 'coach', status: 'active' } })).status, 200)
  assert.equal((await call('/api/session-drafts', { id: 'coach' })).status, 200)
  assert.equal((await call('/api/accounts', { id: 'admin', method: 'PATCH', body: { id: 'coach', role: 'coach', status: 'disabled' } })).status, 200)
  await call('/api/account/request', { id: 'coach', method: 'POST' })
  assert.equal((await call('/api/session-drafts', { id: 'coach' })).status, 403)
})

test('drafts remain private, published sessions retain their owner, copies belong to the copying coach', async () => {
  const { call, member } = setup()
  await member('alice'); await member('bob'); await member('admin', 'admin')
  const draft = createBlankSessionDraft('alice-draft')
  draft.session.games = [{ gameId: 'test-game', duration: 5 }]
  draft.session.duration = 5
  draft.ownerId = 'bob'; draft.session.ownerId = 'bob'; draft.session.ownerName = 'Spoofed'
  const created = await call('/api/session-drafts', { id: 'alice', method: 'POST', body: draft })
  assert.equal(created.status, 201)
  assert.equal((await created.json()).draft.ownerId, 'alice')
  assert.equal((await (await call('/api/session-drafts', { id: 'bob' })).json()).drafts.length, 0)
  for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal((await call('/api/session-drafts/alice-draft', { id: 'bob', method })).status, 404)
  assert.equal((await call('/api/session-drafts/alice-draft/publish', { id: 'bob', method: 'POST' })).status, 404)
  assert.equal((await call('/api/session-drafts/alice-draft', { id: 'admin' })).status, 200)
  assert.equal((await call('/api/session-drafts/alice-draft', { id: 'alice', method: 'PATCH', body: { patches: [{ path: 'ownerId', value: 'bob' }] } })).status, 400)
  const published = await call('/api/session-drafts/alice-draft/publish', { id: 'alice', method: 'POST' })
  assert.equal(published.status, 201)
  const session = (await published.json()).session
  assert.equal(session.ownerId, 'alice'); assert.equal(session.ownerName, 'alice')
  assert.equal((await call(`/api/sessions/${session.id}`, { id: 'bob', method: 'DELETE' })).status, 403)
  assert.equal((await call(`/api/sessions/${session.id}`, { id: 'bob', method: 'PUT', body: { ...session, ownerId: 'bob' } })).status, 403)
  assert.equal((await call('/api/session-drafts', { id: 'bob', method: 'POST', body: createSessionDraftFromSession('steal', session, 'replace') })).status, 403)
  const copy = await call('/api/session-drafts', { id: 'bob', method: 'POST', body: createSessionDraftFromSession('copy', session) })
  assert.equal(copy.status, 201)
  assert.equal((await copy.json()).draft.session.ownerId, 'bob')
  const ownEdit = await call(`/api/sessions/${session.id}`, { id: 'alice', method: 'PUT', body: { ...session, title: 'Edited', ownerId: 'bob' } })
  assert.equal((await ownEdit.json()).session.ownerId, 'alice')
  assert.equal((await call(`/api/sessions/${session.id}`, { id: 'alice', method: 'DELETE' })).status, 204)
})

test('coaches cannot modify the shared library, categories, imports or admin data', async () => {
  const { call, member } = setup(); await member('coach')
  for (const [path, method] of [['/api/games', 'POST'], ['/api/games/example', 'DELETE'], ['/api/games/bulk', 'PUT'], ['/api/categories', 'POST'], ['/api/categories/guard', 'DELETE'], ['/api/game-drafts', 'POST'], ['/api/sessions/import', 'POST'], ['/api/games/import', 'POST']]) {
    const response = await call(path, { id: 'coach', method, body: {} })
    assert.ok([401, 403].includes(response.status), `${method} ${path}: ${response.status}`)
  }
  assert.equal((await call('/api/sessions')).status, 200)
  assert.equal((await call('/api/games')).status, 200)
})

test('old sessions and drafts remain admin managed and cross-site writes are rejected', async () => {
  const { call, member, sqlite } = setup(); await member('coach'); await member('admin', 'admin')
  const old = createBlankSessionDraft('old-draft')
  sqlite.prepare('INSERT INTO session_drafts (id,payload_json,revision,created_at,updated_at) VALUES (?,?,?,?,?)').run(old.id, JSON.stringify(old), 0, old.createdAt, old.updatedAt)
  assert.equal((await call('/api/session-drafts/old-draft', { id: 'coach' })).status, 404)
  assert.equal((await call('/api/session-drafts/old-draft', { id: 'admin' })).status, 200)
  const seeds = (await (await call('/api/sessions')).json()).sessions
  assert.ok(seeds.length > 0)
  assert.equal((await call(`/api/sessions/${seeds[0].id}`, { id: 'coach', method: 'DELETE' })).status, 403)
  assert.equal((await call('/api/account/request', { id: 'new', method: 'POST', origin: 'https://evil.test' })).status, 403)
  assert.equal((await call('/api/admin/sign-in', { method: 'POST', body: { password: 'test-only-password' }, origin: 'https://evil.test' })).status, 403)
})

test('optional display name decoding does not affect stable identity', () => {
  const identity = authenticatedIdentity(new Request('https://test', { headers: { 'oai-authenticated-user-id': 'stable', 'oai-authenticated-user-email': 'display@example.test', 'oai-authenticated-user-full-name': 'Johannes%20Hank%C3%B8', 'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8' } }))
  assert.equal(identity?.name, 'Johannes Hankø'); assert.equal(identity?.id, 'stable')
})

test('sign-out clears shared admin access before leaving the personal session', async () => {
  const { call } = setup()
  const response = await call('/api/account/sign-out', { method: 'POST' })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/?account=1')
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/)
})
