import { isGameDraft } from '../sharedGameDrafts'
import type { GameDraft, GameDraftSummary } from '../sharedGameDrafts'
import type { D1Database, D1RunResult } from './sessionStore'

export interface GameDraftStore {
  list(): Promise<GameDraftSummary[]>
  get(id: string): Promise<GameDraft | null>
  findBySourceGameId(sourceGameId: string): Promise<GameDraft | null>
  create(draft: GameDraft): Promise<GameDraft | null>
  replaceIfRevision(draft: GameDraft, expectedRevision: number): Promise<GameDraft | null>
  deleteIfRevision(id: string, expectedRevision: number): Promise<boolean>
  delete(id: string): Promise<boolean>
}

type DraftRow = {
  id: string
  source_game_id: string | null
  payload_json: string
  revision: number
  created_at: string
  updated_at: string
}

type SummaryRow = {
  id: string
  source_game_id: string | null
  payload_json: string
  updated_at: string
}

function now() {
  return new Date().toISOString()
}

function changes(result: D1RunResult) {
  return Number(result.meta?.changes ?? 0)
}

function payload(draft: GameDraft) {
  return JSON.stringify(draft)
}

function parsePayload(value: string): GameDraft | null {
  try {
    const parsed: unknown = JSON.parse(value)
    const draft = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && !Object.hasOwn(parsed, 'isPublishing')
      ? { ...parsed, isPublishing: false }
      : parsed
    return isGameDraft(draft) ? draft : null
  } catch {
    return null
  }
}

function parseDraft(row: DraftRow): GameDraft | null {
  const draft = parsePayload(row.payload_json)
  if (!draft) return null

  return {
    ...draft,
    id: row.id,
    sourceGameId: row.source_game_id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class D1GameDraftStore implements GameDraftStore {
  constructor(private readonly db: D1Database) {}

  async list() {
    const result = await this.db
      .prepare('SELECT id, source_game_id, payload_json, updated_at FROM game_drafts ORDER BY updated_at DESC')
      .all<SummaryRow>()

    return result.results.flatMap((row) => {
      const draft = parsePayload(row.payload_json)
      return draft ? [{
        id: row.id,
        sourceGameId: row.source_game_id,
        title: draft.game.title,
        updatedAt: row.updated_at,
      }] : []
    })
  }

  async get(id: string) {
    const result = await this.db
      .prepare('SELECT id, source_game_id, payload_json, revision, created_at, updated_at FROM game_drafts WHERE id = ? LIMIT 1')
      .bind(id)
      .all<DraftRow>()

    const row = result.results[0]
    return row ? parseDraft(row) : null
  }

  async findBySourceGameId(sourceGameId: string) {
    const result = await this.db
      .prepare('SELECT id, source_game_id, payload_json, revision, created_at, updated_at FROM game_drafts WHERE source_game_id = ? LIMIT 1')
      .bind(sourceGameId)
      .all<DraftRow>()

    const row = result.results[0]
    return row ? parseDraft(row) : null
  }

  async create(draft: GameDraft) {
    const timestamp = now()
    const result = await this.db
      .prepare('INSERT OR IGNORE INTO game_drafts (id, source_game_id, payload_json, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(draft.id, draft.sourceGameId, payload(draft), draft.revision, timestamp, timestamp)
      .run()

    return changes(result) > 0 ? { ...draft, createdAt: timestamp, updatedAt: timestamp } : null
  }

  async replaceIfRevision(draft: GameDraft, expectedRevision: number) {
    const timestamp = now()
    const result = await this.db.prepare(
      'UPDATE game_drafts SET payload_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?',
    ).bind(payload(draft), expectedRevision + 1, timestamp, draft.id, expectedRevision).run()

    return changes(result) > 0 ? { ...draft, revision: expectedRevision + 1, updatedAt: timestamp } : null
  }

  async delete(id: string) {
    const result = await this.db.prepare('DELETE FROM game_drafts WHERE id = ?').bind(id).run()
    return changes(result) > 0
  }

  async deleteIfRevision(id: string, expectedRevision: number) {
    const result = await this.db
      .prepare('DELETE FROM game_drafts WHERE id = ? AND revision = ?')
      .bind(id, expectedRevision)
      .run()
    return changes(result) > 0
  }
}
