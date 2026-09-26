import { scrypt, timingSafeEqual } from 'node:crypto'
import type { Account } from '../accounts'
import type { D1Database } from './sessionStore'

const encoder = new TextEncoder()
const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], pair => parseInt(pair, 16))
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)))
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
const sessionSeconds = 60 * 60 * 24 * 30
export const passwordCookie = '__Host-okojitsu_session'
export const sessionCookie = (token: string) => `${passwordCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${token ? sessionSeconds : 0}`
export const normalizedEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : ''
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
export const validPassword = (value: unknown): value is string => typeof value === 'string' && [...value].length >= 15 && value.length <= 256

// OWASP scrypt profile: N=2^15, r=8, p=3 (32 MiB). Native Workers crypto; no JS crypto implementation.
function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)))
}
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `scrypt-32768-8-3$${hex(salt)}$${hex(await derive(password, salt))}`
}
export async function verifyPassword(password: string, encoded?: string) {
  const parts = encoded?.split('$')
  const valid = parts?.length === 3 && parts[0] === 'scrypt-32768-8-3' && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{64}$/.test(parts[2])
  const actual = await derive(password, valid ? unhex(parts![1]) : new Uint8Array(16))
  const equal = timingSafeEqual(actual, valid ? unhex(parts![2]) : new Uint8Array(32))
  return Boolean(valid && equal)
}

function cookieToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${passwordCookie}=`))?.slice(passwordCookie.length + 1) ?? ''
}

export class PasswordAuth {
  constructor(private db: D1Database) {}
  async hasPassword(id: string) {
    return Boolean((await this.db.prepare('SELECT account_id FROM account_passwords WHERE account_id = ?').bind(id).all()).results.length)
  }
  async user(request: Request) {
    const token = cookieToken(request)
    if (!/^[a-f0-9]{64}$/.test(token)) return null
    return (await this.db.prepare(`SELECT a.id, a.name, a.email, a.role, a.status FROM accounts a
      JOIN account_sessions s ON s.account_id = a.id WHERE s.token_hash = ? AND s.expires_at > ?`)
      .bind(await digest(token), Date.now()).all<Account>()).results[0] ?? null
  }
  async session(id: string) {
    const token = randomToken()
    await this.db.batch([
      this.db.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').bind(Date.now()),
      this.db.prepare('INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token), id, Date.now() + sessionSeconds * 1000),
    ])
    return token
  }
  async signOut(request: Request) {
    await this.db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(await digest(cookieToken(request))).run()
  }
  async throttle(key: string, limit: number) {
    const now = Date.now()
    // One atomic UPSERT; concurrent requests cannot all pass a read-then-write check.
    const result = await this.db.prepare(`INSERT INTO auth_attempts (key, attempts, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`)
      .bind(await digest(key), now + 15 * 60 * 1000, now, now).all<{ attempts: number }>()
    await this.db.prepare('DELETE FROM auth_attempts WHERE expires_at < ?').bind(now - 24 * 60 * 60 * 1000).run()
    return result.results[0].attempts <= limit
  }
  async login(email: string, password: string) {
    const row = (await this.db.prepare(`SELECT p.account_id, p.password_hash, a.status FROM account_passwords p
      JOIN accounts a ON a.id = p.account_id WHERE p.email = ?`).bind(email).all<{ account_id: string; password_hash: string; status: string }>()).results[0]
    const valid = await verifyPassword(password, row?.password_hash)
    return valid && row?.status === 'active' ? row.account_id : null
  }
  async invite(accountId: string) {
    const token = randomToken()
    await this.db.prepare(`INSERT INTO account_invites (token_hash, account_id, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at`)
      .bind(await digest(token), accountId, Date.now() + 48 * 60 * 60 * 1000).run()
    return token
  }
  async invitation(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return null
    return (await this.db.prepare(`SELECT a.id, a.name, a.email, a.role, a.status FROM accounts a
      JOIN account_invites i ON a.id = i.account_id WHERE i.token_hash = ? AND i.expires_at > ? AND a.status != 'disabled'`)
      .bind(await digest(token), Date.now()).all<Account>()).results[0] ?? null
  }
  async accept(token: string, password: string, name: string) {
    const invitation = await this.invitation(token)
    if (!invitation) return null
    const encoded = await hashPassword(password)
    const tokenHash = await digest(token)
    const now = Date.now()
    // Token consumption, password replacement, activation and revocation are one transaction.
    const eligible = `SELECT a.id FROM account_invites i JOIN accounts a ON a.id = i.account_id
      WHERE i.token_hash = ? AND i.expires_at > ? AND a.status != 'disabled'`
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO account_passwords (account_id, email, password_hash)
        SELECT a.id, lower(trim(a.email)), ? FROM accounts a WHERE a.id IN (${eligible})
        ON CONFLICT(account_id) DO UPDATE SET password_hash = excluded.password_hash`)
        .bind(encoded, tokenHash, now),
      this.db.prepare(`DELETE FROM account_sessions WHERE account_id IN (${eligible})`).bind(tokenHash, now),
      this.db.prepare(`UPDATE accounts SET name = ?, status = 'active' WHERE id IN (${eligible})`).bind(name, tokenHash, now),
      this.db.prepare('DELETE FROM account_invites WHERE token_hash = ?').bind(tokenHash),
      this.db.prepare(`INSERT OR IGNORE INTO account_settings (key) SELECT 'legacy-retired'
        WHERE (SELECT count(*) FROM accounts a JOIN account_passwords p ON a.id = p.account_id WHERE a.role = 'admin' AND a.status = 'active') >= 2`),
    ])
    return Number(results[0].meta?.changes ?? 0) ? invitation.id : null
  }
}
