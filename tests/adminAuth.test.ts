import test from 'node:test'
import assert from 'node:assert/strict'
import { getAdminSession, signInAdmin } from '../src/adminAuth.ts'

test('uses server responses rather than a browser-stored password', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => new Response(url === '/api/admin/session' ? JSON.stringify({ isAdmin: true }) : '{}', { status: url === '/api/admin/sign-in' ? 401 : 200 })
  assert.equal(await getAdminSession(), true)
  assert.equal(await signInAdmin('incorrect'), false)
  globalThis.fetch = originalFetch
})
