import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/server/worker.ts'
import { sqliteDatabase } from './support/sqlite.ts'
import { D1AccountStore } from '../src/server/accountStore.ts'
import { PasswordAuth, hashPassword, verifyPassword } from '../src/server/passwordAuth.ts'
import { createBlankSessionDraft } from '../src/sharedSessionDrafts.ts'

const password = 'correct horse purple dojo'
function setup() {
  const { db, sqlite } = sqliteDatabase()
  const accounts = new D1AccountStore(db), auth = new PasswordAuth(db)
  const env = { DB: db, ADMIN_PASSWORD: 'old-admin', ADMIN_SESSION_SECRET: 'local-test-secret', ASSETS: { fetch: async () => new Response('asset') } }
  const call = (path: string, body?: unknown, cookie = '', extra: Record<string, string> = {}) => worker.fetch(new Request(`https://site.test${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env)
  const invite = async (email = 'coach@example.test', role: 'admin' | 'coach' = 'coach') => {
    const user = await accounts.createInvited('Coach', email, role)
    return { user, token: await auth.invite(user.id) }
  }
  return { db, sqlite, accounts, auth, call, invite }
}
const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]

test('passwords are salted and verified with native scrypt', async () => {
  const a = await hashPassword(password), b = await hashPassword(password)
  assert.notEqual(a, b); assert.ok(!a.includes(password))
  assert.equal(await verifyPassword(password, a), true)
  assert.equal(await verifyPassword('incorrect password', a), false)
  assert.equal(await verifyPassword(password), false)
})

test('invited coach signs in with email alone and retains ownership protections', async () => {
  const { call, invite, sqlite } = setup(); const { user, token } = await invite()
  assert.equal((await call('/api/auth/invite', { name: 'Attacker', email: 'attacker@example.test', role: 'admin' })).status, 403)
  assert.equal((await call('/api/auth/accept', { token, name: 'Coach', password: 'short' })).status, 400)
  const accepted = await call('/api/auth/accept', { token, name: 'Coach', password, role: 'admin' })
  assert.equal(accepted.status, 200)
  assert.match(accepted.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Lax/)
  const cookie = cookieOf(accepted)
  const account = await (await call('/api/account', undefined, cookie)).json()
  assert.equal(account.user.id, user.id); assert.equal(account.user.role, 'coach'); assert.equal(account.authMethod, 'password')
  assert.equal((await call('/api/session-drafts', createBlankSessionDraft('mine'), cookie)).status, 201)
  assert.equal((await call('/api/games', {}, cookie)).status, 401)
  assert.equal((await call('/api/auth/login', { email: ' COACH@EXAMPLE.TEST ', password })).status, 200)
  assert.equal((await call('/api/auth/login', { email: 'coach@example.test', password: 'wrong password' })).status, 401)
  assert.equal((await call('/api/auth/accept', { token, name: 'Coach', password })).status, 410)
  const row = sqlite.prepare('SELECT token_hash FROM account_sessions LIMIT 1').get()!
  assert.ok(!cookie.includes(row.token_hash as string))
  assert.equal((await call('/api/auth/login', { email: 'coach@example.test', password }, '', { origin: 'https://evil.test' })).status, 403)
})

test('reset links expire, replace previous links, work once and revoke existing sessions', async () => {
  const { call, auth, invite, sqlite } = setup(); const { user, token } = await invite()
  const oldSession = cookieOf(await call('/api/auth/accept', { token, name: 'Coach', password }))
  const oldReset = await auth.invite(user.id), reset = await auth.invite(user.id)
  assert.equal(await auth.invitation(oldReset), null)
  const changed = await call('/api/auth/accept', { token: reset, name: 'Coach', password: 'brand new purple dojo password' })
  assert.equal(changed.status, 200)
  assert.equal((await (await call('/api/account', undefined, oldSession)).json()).user, null)
  assert.equal((await call('/api/auth/login', { email: user.email, password })).status, 401)
  assert.equal((await call('/api/auth/login', { email: user.email, password: 'brand new purple dojo password' })).status, 200)
  const expired = await auth.invite(user.id)
  sqlite.prepare('UPDATE account_invites SET expires_at = 0').run()
  assert.equal((await call('/api/auth/accept', { token: expired, name: 'Coach', password })).status, 410)
})

test('disabling an account revokes sessions and invitations even after reactivation', async () => {
  const { call, invite, auth, accounts } = setup(); const { user, token } = await invite()
  const cookie = cookieOf(await call('/api/auth/accept', { token, name: 'Coach', password }))
  const reset = await auth.invite(user.id)
  await accounts.update(user.id, 'coach', 'disabled')
  assert.equal((await call('/api/auth/login', { email: user.email, password })).status, 401)
  assert.equal(await auth.invitation(reset), null)
  await accounts.update(user.id, 'coach', 'active')
  assert.equal((await (await call('/api/account', undefined, cookie)).json()).user, null)
})

test('legacy admin can invite two personal admins without any ChatGPT identity', async () => {
  const { call, accounts } = setup()
  const legacy = cookieOf(await call('/api/admin/sign-in', { password: 'old-admin' }))
  for (const name of ['first', 'second']) {
    const response = await call('/api/auth/invite', { name, email: `${name}@example.test`, role: 'admin' }, legacy)
    assert.equal(response.status, 200)
    const { token } = await response.json()
    const accepted = await call('/api/auth/accept', { token, name, password })
    assert.equal(accepted.status, 200)
    assert.equal((await (await call('/api/account', undefined, cookieOf(accepted))).json()).isAdmin, true)
  }
  assert.equal(await accounts.legacyEnabled(), false)
  assert.equal((await call('/api/admin/sign-in', { password: 'old-admin' })).status, 403)
})

test('existing ChatGPT accounts migrate without changing IDs and cannot use old sign-in afterward', async () => {
  const { accounts, call } = setup()
  await accounts.request({ id: 'old-id', name: 'Old coach', email: 'old@example.test' }); await accounts.update('old-id', 'coach', 'active')
  const headers = { 'oai-authenticated-user-id': 'old-id', 'oai-authenticated-user-email': 'old@example.test' }
  assert.equal((await (await call('/api/account', undefined, '', headers)).json()).authMethod, 'previous-account')
  const migrated = await call('/api/auth/migrate', { password }, '', headers)
  assert.equal(migrated.status, 200)
  assert.equal((await (await call('/api/account', undefined, cookieOf(migrated))).json()).user.id, 'old-id')
  assert.equal((await (await call('/api/account', undefined, '', headers)).json()).user, null)
})

test('sign-out revokes tokens; password changes require the current password; logins are throttled', async () => {
  const { call, invite } = setup(); const { token } = await invite()
  const cookie = cookieOf(await call('/api/auth/accept', { token, name: 'Coach', password }))
  assert.equal((await call('/api/auth/change-password', { currentPassword: 'wrong', password }, cookie)).status, 401)
  const logout = await call('/api/account/sign-out', {}, cookie)
  assert.equal(logout.status, 303); assert.equal(logout.headers.get('location'), '/?account=1')
  assert.equal((await (await call('/api/account', undefined, cookie)).json()).user, null)
  for (let i = 0; i < 10; i++) assert.equal((await call('/api/auth/login', { email: 'missing@example.test', password })).status, 401)
  assert.equal((await call('/api/auth/login', { email: 'missing@example.test', password })).status, 429)
})
