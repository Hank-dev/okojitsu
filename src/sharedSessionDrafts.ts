import type { SessionGame, SessionPlan } from './types'

export interface SessionDraft {
  id: string
  session: SessionPlan
  revision: number
  isPublishing: boolean
  createdAt: string
  updatedAt: string
}

export interface SessionDraftSummary {
  id: string
  title: string
  updatedAt: string
}

export type SessionDraftPatchPath = 'title' | 'level' | 'focus' | 'notes' | 'games'

export type SessionDraftPatch =
  | { path: Exclude<SessionDraftPatchPath, 'games'>; value: string }
  | { path: 'games'; value: SessionGame[] }

const DRAFT_KEYS = new Set(['id', 'session', 'revision', 'isPublishing', 'createdAt', 'updatedAt'])
const SESSION_KEYS = new Set(['id', 'title', 'date', 'duration', 'level', 'focus', 'games', 'notes'])
const GAME_KEYS = new Set(['gameId', 'duration', 'notes'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>) {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.has(key))
}

function isGame(value: unknown): value is SessionGame {
  return isRecord(value)
    && hasOnlyKeys(value, GAME_KEYS)
    && typeof value.gameId === 'string'
    && value.gameId.trim().length > 0
    && typeof value.duration === 'number'
    && Number.isFinite(value.duration)
    && value.duration >= 0
    && (value.notes === undefined || typeof value.notes === 'string')
}

function isSession(value: unknown): value is SessionPlan {
  return isRecord(value)
    && hasOnlyKeys(value, SESSION_KEYS)
    && typeof value.id === 'string' && value.id.trim().length > 0
    && typeof value.title === 'string'
    && isTimestamp(value.date)
    && typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration >= 0
    && typeof value.level === 'string'
    && typeof value.focus === 'string'
    && typeof value.notes === 'string'
    && Array.isArray(value.games) && value.games.every(isGame)
}

function cloneGames(games: SessionGame[]) {
  return games.map(game => game.notes === undefined ? { gameId: game.gameId, duration: game.duration } : { gameId: game.gameId, duration: game.duration, notes: game.notes })
}

function cloneSession(session: SessionPlan): SessionPlan {
  return { ...session, games: cloneGames(session.games) }
}

function cloneDraft(draft: SessionDraft): SessionDraft {
  return { ...draft, session: cloneSession(draft.session) }
}

function validGames(games: SessionGame[]) {
  return games.every(isGame) && new Set(games.map(game => game.gameId)).size === games.length
}

export function createBlankSessionDraft(id: string): SessionDraft {
  if (!id.trim()) throw new Error('Invalid draft id.')
  const timestamp = new Date().toISOString()
  return {
    id,
    session: { id: `session-${crypto.randomUUID()}`, title: 'New Session', date: timestamp, duration: 0, level: 'beginner', focus: '', notes: '', games: [] },
    revision: 0,
    isPublishing: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createSessionDraftFromSession(id: string, session: SessionPlan): SessionDraft {
  const draft = createBlankSessionDraft(id)
  return { ...draft, session: { ...cloneSession(session), id: `session-${crypto.randomUUID()}`, date: new Date().toISOString() } }
}

export function isSessionDraftPatch(value: unknown): value is SessionDraftPatch {
  if (!isRecord(value) || typeof value.path !== 'string') return false
  if (value.path === 'games') return Array.isArray(value.value) && validGames(value.value as SessionGame[])
  return ['title', 'level', 'focus', 'notes'].includes(value.path) && typeof value.value === 'string'
}

export function applySessionDraftPatches(draft: SessionDraft, patches: SessionDraftPatch[]): SessionDraft {
  const next = cloneDraft(draft)
  for (const patch of patches) {
    if (!isSessionDraftPatch(patch)) throw new Error('Invalid session draft patch.')
    if (patch.path === 'games') next.session.games = cloneGames(patch.value)
    else next.session[patch.path] = patch.value
  }
  next.session.duration = next.session.games.reduce((total, game) => total + game.duration, 0)
  return next
}

export function isSessionDraft(value: unknown): value is SessionDraft {
  return isRecord(value)
    && hasOnlyKeys(value, DRAFT_KEYS)
    && typeof value.id === 'string' && value.id.trim().length > 0
    && isSession(value.session)
    && validGames(value.session.games)
    && value.session.duration === value.session.games.reduce((total, game) => total + game.duration, 0)
    && typeof value.revision === 'number' && Number.isInteger(value.revision) && value.revision >= 0
    && typeof value.isPublishing === 'boolean'
    && isTimestamp(value.createdAt) && isTimestamp(value.updatedAt)
}

function patchAtPath(draft: SessionDraft, path: SessionDraftPatchPath): SessionDraftPatch {
  if (path === 'games') return { path, value: cloneGames(draft.session.games) }
  return { path, value: draft.session[path] }
}

export function mergeRemoteSessionDraft(local: SessionDraft, remote: SessionDraft, activePath: SessionDraftPatchPath | null): SessionDraft {
  if (remote.revision < local.revision) return cloneDraft(local)
  return activePath ? applySessionDraftPatches(remote, [patchAtPath(local, activePath)]) : cloneDraft(remote)
}
