import { isSessionDraft } from '../sharedSessionDrafts'
import type { SessionDraft, SessionDraftSummary } from '../sharedSessionDrafts'
import type { D1Database, D1RunResult } from './sessionStore'

export interface SessionDraftStore {
  list(): Promise<SessionDraftSummary[]>
  get(id: string): Promise<SessionDraft | null>
  create(draft: SessionDraft): Promise<SessionDraft | null>
  replaceIfRevision(draft: SessionDraft, expectedRevision: number): Promise<SessionDraft | null>
  deleteIfRevision(id: string, expectedRevision: number): Promise<boolean>
  delete(id: string): Promise<boolean>
}

type Row = { id: string, payload_json: string, revision: number, created_at: string, updated_at: string }
type SummaryRow = Pick<Row, 'id' | 'payload_json' | 'updated_at'>
const changes = (result: D1RunResult) => Number(result.meta?.changes ?? 0)
const now = () => new Date().toISOString()

function parse(row: Row): SessionDraft | null {
  try {
    const raw = JSON.parse(row.payload_json) as unknown
    const draft = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && !Object.hasOwn(raw, 'isPublishing') ? { ...raw, isPublishing: false } : raw
    return isSessionDraft(draft) ? { ...draft, id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at } : null
  } catch { return null }
}

export class D1SessionDraftStore implements SessionDraftStore {
  constructor(private readonly db: D1Database) {}

  async list() {
    const result = await this.db.prepare('SELECT id, payload_json, updated_at FROM session_drafts ORDER BY updated_at DESC').all<SummaryRow>()
    return result.results.flatMap(row => {
      try {
        const raw = JSON.parse(row.payload_json) as unknown
        return isSessionDraft(raw) ? [{ id: row.id, title: raw.session.title, updatedAt: row.updated_at }] : []
      } catch { return [] }
    })
  }

  async get(id: string) {
    const result = await this.db.prepare('SELECT id, payload_json, revision, created_at, updated_at FROM session_drafts WHERE id = ? LIMIT 1').bind(id).all<Row>()
    return result.results[0] ? parse(result.results[0]) : null
  }

  async create(draft: SessionDraft) {
    const timestamp = now()
    const result = await this.db.prepare('INSERT OR IGNORE INTO session_drafts (id, payload_json, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(draft.id, JSON.stringify(draft), draft.revision, timestamp, timestamp).run()
    return changes(result) ? { ...draft, createdAt: timestamp, updatedAt: timestamp } : null
  }

  async replaceIfRevision(draft: SessionDraft, expectedRevision: number) {
    const timestamp = now()
    const result = await this.db.prepare('UPDATE session_drafts SET payload_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?')
      .bind(JSON.stringify(draft), expectedRevision + 1, timestamp, draft.id, expectedRevision).run()
    return changes(result) ? { ...draft, revision: expectedRevision + 1, updatedAt: timestamp } : null
  }

  async deleteIfRevision(id: string, expectedRevision: number) {
    return changes(await this.db.prepare('DELETE FROM session_drafts WHERE id = ? AND revision = ?').bind(id, expectedRevision).run()) > 0
  }

  async delete(id: string) {
    return changes(await this.db.prepare('DELETE FROM session_drafts WHERE id = ?').bind(id).run()) > 0
  }
}
