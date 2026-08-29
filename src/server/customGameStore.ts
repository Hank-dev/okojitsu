import { isCategoryKey, parseCategoryPayload, parseGamePayload } from '../sharedGames'
import type { DraftPublishMode } from '../sharedGameDrafts'
import type { CategoryMeta, CategoryMetaMap, Game } from '../types'
import type { D1Database, D1RunResult } from './sessionStore'

export type D1CustomContentDatabase = D1Database

export type PendingCategoryPublication = {
  key: string
  category: CategoryMeta
}

export type PendingCategoryPublicationResult =
  | { kind: 'saved'; game: Game }
  | { kind: 'category-conflict' }
  | { kind: 'game-conflict' }
  | { kind: 'draft-conflict' }

export interface CustomGameStore {
  list(): Promise<Game[]>
  create(game: Game): Promise<Game | null>
  replace(id: string, game: Game): Promise<Game | null>
  publishWithCategory(
    game: Game,
    pendingCategory: PendingCategoryPublication,
    mode: DraftPublishMode,
    draftId: string,
    claimedRevision: number,
  ): Promise<PendingCategoryPublicationResult>
  publishWithoutCategory(
    game: Game,
    mode: DraftPublishMode,
    draftId: string,
    claimedRevision: number,
  ): Promise<PendingCategoryPublicationResult>
  delete(id: string): Promise<boolean>
  importMissing(games: Game[]): Promise<number>
}

export interface CategoryStore {
  list(): Promise<CategoryMetaMap>
  createIfAbsent(key: string, category: CategoryMeta): Promise<CategoryMeta | null>
  upsert(key: string, category: CategoryMeta): Promise<CategoryMeta>
}

export interface DeletedSeedGameStore {
  list(): Promise<string[]>
  add(id: string): Promise<void>
}

function now() {
  return new Date().toISOString()
}

function changes(result: D1RunResult) {
  return Number(result.meta?.changes ?? 0)
}

function payload(value: unknown) {
  return JSON.stringify(value)
}

function publicationConflict(error: unknown): 'category-conflict' | 'game-conflict' | null {
  const message = error instanceof Error ? error.message : ''
  if (/(?:UNIQUE|PRIMARY KEY) constraint failed:\s*custom_categories\.id/i.test(message)) return 'category-conflict'
  if (/(?:UNIQUE|PRIMARY KEY) constraint failed:\s*custom_games\.id/i.test(message)) return 'game-conflict'
  return null
}

type PayloadRow = { payload_json: string }
type CategoryRow = { id: string; payload_json: string }

export class D1CustomGameStore implements CustomGameStore {
  constructor(private readonly db: D1CustomContentDatabase) {}

  async list() {
    const result = await this.db
      .prepare('SELECT payload_json FROM custom_games ORDER BY updated_at DESC')
      .all<PayloadRow>()

    return result.results.flatMap(row => {
      const game = parseGamePayload(row.payload_json)
      return game ? [{ ...game, level: 'beginner' }] : []
    })
  }

  async create(game: Game) {
    const timestamp = now()
    const result = await this.db
      .prepare('INSERT OR IGNORE INTO custom_games (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .bind(game.id, payload({ ...game, level: 'beginner' }), timestamp, timestamp)
      .run()

    return changes(result) > 0 ? { ...game, level: 'beginner' } : null
  }

  async replace(id: string, game: Game) {
    const result = await this.db
      .prepare('UPDATE custom_games SET payload_json = ?, updated_at = ? WHERE id = ?')
      .bind(payload({ ...game, level: 'beginner' }), now(), id)
      .run()

    return changes(result) > 0 ? { ...game, level: 'beginner' } : null
  }

  async publishWithCategory(
    game: Game,
    pendingCategory: PendingCategoryPublication,
    mode: DraftPublishMode,
    draftId: string,
    claimedRevision: number,
  ) {
    return this.publishClaimedGame(game, pendingCategory, mode, draftId, claimedRevision)
  }

  async publishWithoutCategory(game: Game, mode: DraftPublishMode, draftId: string, claimedRevision: number) {
    return this.publishClaimedGame(game, null, mode, draftId, claimedRevision)
  }

  private async publishClaimedGame(
    game: Game,
    pendingCategory: PendingCategoryPublication | null,
    mode: DraftPublishMode,
    draftId: string,
    claimedRevision: number,
  ): Promise<PendingCategoryPublicationResult> {
    const timestamp = now()
    const persistedGame = { ...game, level: 'beginner' as const }
    const claimFence = 'EXISTS (SELECT 1 FROM game_drafts WHERE id = ? AND revision = ?)'
    const replacementTarget = 'EXISTS (SELECT 1 FROM custom_games WHERE id = ?)'
    const statements = []

    // D1 runs this batch as one transaction. Every write shares the claimed draft
    // revision predicate, and the final guarded delete is the success fence: if it
    // changes zero rows, no category or game write was eligible to run.
    if (pendingCategory) {
      const categoryFence = mode === 'replace' ? ` AND ${replacementTarget}` : ''
      const categoryBindings = mode === 'replace'
        ? [pendingCategory.key, payload(pendingCategory.category), timestamp, timestamp, draftId, claimedRevision, game.id]
        : [pendingCategory.key, payload(pendingCategory.category), timestamp, timestamp, draftId, claimedRevision]
      statements.push(this.db
        .prepare(`INSERT INTO custom_categories (id, payload_json, created_at, updated_at) SELECT ?, ?, ?, ? WHERE ${claimFence}${categoryFence}`)
        .bind(...categoryBindings))
    }

    if (mode === 'create') {
      statements.push(this.db
        .prepare(`INSERT INTO custom_games (id, payload_json, created_at, updated_at) SELECT ?, ?, ?, ? WHERE ${claimFence}`)
        .bind(game.id, payload(persistedGame), timestamp, timestamp, draftId, claimedRevision))
      statements.push(this.db
        .prepare('DELETE FROM game_drafts WHERE id = ? AND revision = ?')
        .bind(draftId, claimedRevision))
    } else {
      statements.push(this.db
        .prepare(`UPDATE custom_games SET payload_json = ?, updated_at = ? WHERE id = ? AND ${claimFence}`)
        .bind(payload(persistedGame), timestamp, game.id, draftId, claimedRevision))
      statements.push(this.db
        .prepare(`DELETE FROM game_drafts WHERE id = ? AND revision = ? AND ${replacementTarget}`)
        .bind(draftId, claimedRevision, game.id))
    }

    try {
      const results = await this.db.batch(statements)
      if (changes(results.at(-1)!) > 0) return { kind: 'saved', game: persistedGame }

      const matchingClaim = await this.db
        .prepare('SELECT id FROM game_drafts WHERE id = ? AND revision = ? LIMIT 1')
        .bind(draftId, claimedRevision)
        .all<{ id: string }>()
      return matchingClaim.results.length > 0 ? { kind: 'game-conflict' } : { kind: 'draft-conflict' }
    } catch (publishError) {
      const conflict = publicationConflict(publishError)
      if (conflict) return { kind: conflict }
      throw publishError
    }
  }

  async delete(id: string) {
    const result = await this.db.prepare('DELETE FROM custom_games WHERE id = ?').bind(id).run()
    return changes(result) > 0
  }

  async importMissing(games: Game[]) {
    if (games.length === 0) return 0

    const timestamp = now()
    const results = await this.db.batch(games.map(game => this.db
      .prepare('INSERT OR IGNORE INTO custom_games (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .bind(game.id, payload({ ...game, level: 'beginner' }), timestamp, timestamp)))

    return results.reduce((total, result) => total + changes(result), 0)
  }
}

export class D1DeletedSeedGameStore implements DeletedSeedGameStore {
  constructor(private readonly db: D1CustomContentDatabase) {}

  async list() {
    const result = await this.db.prepare('SELECT id FROM deleted_seed_games').all<{ id: string }>()
    return result.results.map(row => row.id)
  }

  async add(id: string) {
    await this.db
      .prepare('INSERT OR IGNORE INTO deleted_seed_games (id, deleted_at) VALUES (?, ?)')
      .bind(id, now())
      .run()
  }
}

export class D1CustomCategoryStore implements CategoryStore {
  constructor(private readonly db: D1CustomContentDatabase) {}

  async list() {
    const result = await this.db
      .prepare('SELECT id, payload_json FROM custom_categories ORDER BY updated_at DESC')
      .all<CategoryRow>()

    return Object.fromEntries(result.results.flatMap(row => {
      if (!isCategoryKey(row.id)) return []
      const category = parseCategoryPayload(row.payload_json)
      return category ? [[row.id, category] as const] : []
    }))
  }

  async upsert(key: string, category: CategoryMeta) {
    const timestamp = now()
    await this.db
      .prepare('INSERT INTO custom_categories (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at')
      .bind(key, payload(category), timestamp, timestamp)
      .run()
    return category
  }

  async createIfAbsent(key: string, category: CategoryMeta) {
    const timestamp = now()
    const result = await this.db
      .prepare('INSERT OR IGNORE INTO custom_categories (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .bind(key, payload(category), timestamp, timestamp)
      .run()
    return changes(result) > 0 ? category : null
  }
}
