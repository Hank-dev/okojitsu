import type { Account } from '../accounts'
import { D1AccountStore } from './accountStore'
import { normalizedEmail, PasswordAuth, sessionCookie, validEmail, validPassword } from './passwordAuth'

const reply = (data: unknown, status = 200, cookie?: string) => new Response(JSON.stringify(data), { status, headers: {
  'content-type': 'application/json', 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}),
} })
const fail = (error: string, status = 400) => reply({ error }, status)

export async function passwordRoutes(request: Request, auth: PasswordAuth, accounts: D1AccountStore, user: Account | null, isAdmin: boolean, previousAccount: boolean): Promise<Response> {
  if (request.method !== 'POST') return fail('Method not allowed.', 405)
  // These endpoints only accept small JSON payloads, including password setup forms.
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('JSON is required.', 415)
  const reader = request.body?.getReader()
  if (!reader) return fail('A request body is required.')
  const chunks: Uint8Array[] = []; let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 8192) { await reader.cancel(); return fail('Request too large.', 413) }
    chunks.push(value)
  }
  let body: Record<string, unknown>
  try {
    const bytes = new Uint8Array(length); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('Invalid request.')
    body = parsed
  } catch { return fail('Invalid request.') }
  const path = new URL(request.url).pathname
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  const startSession = async (id: string) => reply({ ok: true }, 200, sessionCookie(await auth.session(id)))

  if (path === '/api/auth/login') {
    const email = normalizedEmail(body.email)
    if (!validEmail(email) || typeof body.password !== 'string' || !body.password.length || body.password.length > 256) return fail('Email or password is incorrect.', 401)
    if (!await auth.throttle(`login-ip:${ip}`, 50) || !await auth.throttle(`login-email:${email}`, 10)) return fail('Too many attempts. Try again in 15 minutes.', 429)
    const id = await auth.login(email, body.password)
    return id ? startSession(id) : fail('Email or password is incorrect.', 401)
  }
  if (path === '/api/auth/invitation') {
    if (!await auth.throttle(`invite-read:${ip}`, 100)) return fail('Too many attempts. Try again later.', 429)
    const invite = await auth.invitation(typeof body.token === 'string' ? body.token : '')
    return invite ? reply({ name: invite.name, email: invite.email }) : fail('This link has expired or was already used. Ask an admin for a new one.', 410)
  }
  if (path === '/api/auth/accept') {
    if (!validPassword(body.password)) return fail('Use a password of at least 15 characters (maximum 256).')
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 100) return fail('Enter your name (maximum 100 characters).')
    if (!await auth.throttle(`invite-accept:${ip}`, 30)) return fail('Too many attempts. Try again in 15 minutes.', 429)
    const id = await auth.accept(typeof body.token === 'string' ? body.token : '', body.password, name)
    return id ? startSession(id) : fail('This link has expired or was already used. Ask an admin for a new one.', 410)
  }
  if (path === '/api/auth/invite') {
    if (!isAdmin) return fail('Admin access is required.', 403)
    let target: Account | null
    if (typeof body.accountId === 'string') {
      target = await accounts.get(body.accountId)
      if (!target || target.status === 'disabled') return fail('Restore this account before creating a link.', 409)
    } else {
      const email = normalizedEmail(body.email)
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!validEmail(email) || !name || name.length > 100 || !['coach', 'admin'].includes(body.role as string)) return fail('Enter a name, valid email and role.')
      if ((await accounts.findEmail(email)).length) return fail('This email already has an account. Use its setup/reset link button below.', 409)
      target = await accounts.createInvited(name, email, body.role as 'admin' | 'coach')
    }
    return reply({ token: await auth.invite(target.id), email: target.email })
  }
  if (path === '/api/auth/migrate' || path === '/api/auth/change-password') {
    if (!user || user.status !== 'active') return fail('Sign in first.', 401)
    if (!validPassword(body.password)) return fail('Use a password of at least 15 characters (maximum 256).')
    if (!await auth.throttle(`password-change:${user.id}`, 10)) return fail('Too many attempts. Try again in 15 minutes.', 429)
    if (path === '/api/auth/migrate') {
      if (!previousAccount || await auth.hasPassword(user.id)) return fail('Use your existing password to make this change.', 403)
    } else if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 256 || await auth.login(normalizedEmail(user.email), body.currentPassword) !== user.id) return fail('Current password is incorrect.', 401)
    const id = await auth.accept(await auth.invite(user.id), body.password, user.name)
    return id ? startSession(id) : fail('Unable to set your password. Try again.', 409)
  }
  return fail('Not found.', 404)
}
