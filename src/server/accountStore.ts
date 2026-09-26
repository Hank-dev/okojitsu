import type { Account, AccountRole, AccountStatus } from '../accounts'
import type { D1Database } from './sessionStore'

export function authenticatedIdentity(request: Request): Omit<Account, 'role' | 'status'> | null {
  // Sites dispatch owns and sanitizes these headers. Never expose this Worker directly.
  const id = request.headers.get('oai-authenticated-user-id')
  const email = request.headers.get('oai-authenticated-user-email')
  if (!id || !email) return null
  let name = request.headers.get('oai-authenticated-user-full-name') || email.split('@')[0]
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(name) } catch { name = email.split('@')[0] }
  }
  return { id, email, name: name.slice(0, 150) }
}

export class D1AccountStore {
  constructor(private db: D1Database) {}
  async get(id: string) {
    return (await this.db.prepare('SELECT id, name, email, role, status FROM accounts WHERE id = ?').bind(id).all<Account>()).results[0] ?? null
  }
  async list() {
    return (await this.db.prepare('SELECT id, name, email, role, status FROM accounts ORDER BY created_at DESC').all<Account>()).results
  }
  async findEmail(email: string) {
    return (await this.db.prepare('SELECT id, name, email, role, status FROM accounts WHERE lower(trim(email)) = ?').bind(email).all<Account>()).results
  }
  async createInvited(name: string, email: string, role: AccountRole) {
    const id = crypto.randomUUID()
    await this.db.prepare("INSERT INTO accounts (id, name, email, role, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
      .bind(id, name, email, role, new Date().toISOString()).run()
    return (await this.get(id))!
  }
  async request(identity: Omit<Account, 'role' | 'status'>) {
    await this.db.prepare("INSERT OR IGNORE INTO accounts (id, name, email, role, status, created_at) VALUES (?, ?, ?, 'coach', 'pending', ?)")
      .bind(identity.id, identity.name, identity.email, new Date().toISOString()).run()
    return this.get(identity.id)
  }
  async legacyEnabled() {
    return !(await this.db.prepare("SELECT key FROM account_settings WHERE key = 'legacy-retired'").all()).results.length
  }
  async update(id: string, role: AccountRole, status: AccountStatus) {
    // Protect the last password-enabled administrator, even for concurrent
    // requests. A previous ChatGPT account without a password is not enough to
    // keep the site recoverable.
    const results = await this.db.batch([
      this.db.prepare(`UPDATE accounts SET role = ?, status = ? WHERE id = ? AND (
        role != 'admin' OR status != 'active' OR (? = 'admin' AND ? = 'active')
        OR NOT EXISTS (SELECT 1 FROM account_passwords WHERE account_id = accounts.id)
        OR (SELECT count(*) FROM accounts a JOIN account_passwords p ON p.account_id = a.id
            WHERE a.role = 'admin' AND a.status = 'active') > 1
      )`).bind(role, status, id, role, status),
      this.db.prepare(`INSERT OR IGNORE INTO account_settings (key) SELECT 'legacy-retired'
        WHERE (SELECT count(*) FROM accounts a JOIN account_passwords p ON a.id = p.account_id WHERE a.role = 'admin' AND a.status = 'active') >= 2`),
      this.db.prepare("DELETE FROM account_sessions WHERE account_id = ? AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND status = 'disabled')").bind(id, id),
      this.db.prepare("DELETE FROM account_invites WHERE account_id = ? AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND status = 'disabled')").bind(id, id),
    ])
    return Number(results[0].meta?.changes ?? 0) > 0
  }
}
