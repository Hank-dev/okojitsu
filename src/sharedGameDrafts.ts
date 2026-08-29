import type { DraftGameLevel, Game, PlayerRole, Progression, Skill } from './types'

export type DraftPublishMode = 'create' | 'replace'

export interface PendingCategory {
  label: string
  emoji: string
}

export interface GameDraft {
  id: string
  sourceGameId: string | null
  publishMode: DraftPublishMode
  game: Game
  pendingCategory: PendingCategory | null
  revision: number
  isPublishing: boolean
  createdAt: string
  updatedAt: string
}

export interface GameDraftSummary {
  id: string
  sourceGameId: string | null
  title: string
  updatedAt: string
}

export type GameDraftPatchPath =
  | 'title' | 'category' | 'subcategory' | 'level' | 'type' | 'source' | 'startingPosition'
  | 'designRationale' | 'tags' | 'pendingCategory' | 'pendingCategory.label'
  | 'pendingCategory.emoji' | `players.${0 | 1}.role`
  | `players.${0 | 1}.objective` | `players.${0 | 1}.winCondition`
  | `players.${0 | 1}.constraints`

export interface GameDraftPatch {
  path: GameDraftPatchPath
  value: string | string[] | null
}

const SKILLS: ReadonlySet<Skill> = new Set(['connection', 'distance', 'destabilize', 'segment', 'isolate', 'immobilize'])
const DRAFT_LEVELS: ReadonlySet<DraftGameLevel> = new Set(['beginner', 'all-levels'])
const PATCH_PATHS: ReadonlySet<string> = new Set([
  'title', 'category', 'subcategory', 'level', 'type', 'source', 'startingPosition', 'designRationale', 'tags',
  'pendingCategory', 'pendingCategory.label', 'pendingCategory.emoji',
])
const DRAFT_KEYS: ReadonlySet<string> = new Set([
  'id', 'sourceGameId', 'publishMode', 'game', 'pendingCategory', 'revision', 'isPublishing', 'createdAt', 'updatedAt',
])
const GAME_KEYS: ReadonlySet<string> = new Set([
  'id', 'title', 'category', 'subcategory', 'source', 'level', 'type', 'startingPosition', 'players', 'constraints',
  'designRationale', 'tags', 'skills', 'progression', 'sourceUrl',
])
const PLAYER_KEYS: ReadonlySet<string> = new Set(['role', 'objective', 'winCondition', 'constraints'])
const PROGRESSION_KEYS: ReadonlySet<string> = new Set(['chain', 'chainLabel', 'step', 'totalSteps', 'prevId', 'nextId'])
const PENDING_CATEGORY_KEYS: ReadonlySet<string> = new Set(['label', 'emoji'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>): boolean {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && allowedKeys.has(key))
}

function isDraftLevel(value: unknown): value is DraftGameLevel {
  return typeof value === 'string' && DRAFT_LEVELS.has(value as DraftGameLevel)
}

function isSkill(value: unknown): value is Skill {
  return typeof value === 'string' && SKILLS.has(value as Skill)
}

function isPlayerRoleDraft(value: unknown): value is PlayerRole {
  return isRecord(value)
    && hasOnlyKeys(value, PLAYER_KEYS)
    && typeof value.role === 'string'
    && typeof value.objective === 'string'
    && typeof value.winCondition === 'string'
    && isStringArray(value.constraints)
}

function isProgression(value: unknown): value is Progression | null {
  if (value === null) return true
  return isRecord(value)
    && hasOnlyKeys(value, PROGRESSION_KEYS)
    && isNonEmptyString(value.chain)
    && isNonEmptyString(value.chainLabel)
    && typeof value.step === 'number'
    && Number.isFinite(value.step)
    && typeof value.totalSteps === 'number'
    && Number.isFinite(value.totalSteps)
    && (value.prevId === null || typeof value.prevId === 'string')
    && (value.nextId === null || typeof value.nextId === 'string')
}

function isDraftGame(value: unknown): value is Game {
  if (!isRecord(value)) return false

  return hasOnlyKeys(value, GAME_KEYS)
    && isNonEmptyString(value.id)
    && typeof value.title === 'string'
    && typeof value.category === 'string'
    && (value.subcategory === undefined || typeof value.subcategory === 'string')
    && typeof value.source === 'string'
    && isDraftLevel(value.level)
    && typeof value.type === 'string'
    && typeof value.startingPosition === 'string'
    && Array.isArray(value.players)
    && value.players.length === 2
    && value.players.every(isPlayerRoleDraft)
    && isStringArray(value.constraints)
    && (value.designRationale === undefined || typeof value.designRationale === 'string')
    && isStringArray(value.tags)
    && Array.isArray(value.skills)
    && value.skills.every(isSkill)
    && isProgression(value.progression)
    && (value.sourceUrl === undefined || value.sourceUrl === null || typeof value.sourceUrl === 'string')
}

function isPendingCategory(value: unknown): value is PendingCategory {
  return isRecord(value)
    && hasOnlyKeys(value, PENDING_CATEGORY_KEYS)
    && typeof value.label === 'string'
    && typeof value.emoji === 'string'
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isGameDraftPatchPath(value: unknown): value is GameDraftPatchPath {
  if (typeof value !== 'string') return false
  if (PATCH_PATHS.has(value)) return true
  return /^players\.[01]\.(role|objective|winCondition|constraints)$/.test(value)
}

export function categoryKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isGameDraftPatch(value: unknown): value is GameDraftPatch {
  if (!isRecord(value) || !isGameDraftPatchPath(value.path)) return false

  if (value.path === 'pendingCategory') return value.value === null
  if (value.path === 'tags' || value.path.endsWith('.constraints')) return isStringArray(value.value)
  if (value.path === 'level') return isDraftLevel(value.value)
  return typeof value.value === 'string'
}

function clonePlayer(player: PlayerRole): PlayerRole {
  return {
    role: player.role,
    objective: player.objective,
    winCondition: player.winCondition,
    constraints: [...player.constraints],
  }
}

function cloneProgression(progression: Progression | null): Progression | null {
  return progression ? {
    chain: progression.chain,
    chainLabel: progression.chainLabel,
    step: progression.step,
    totalSteps: progression.totalSteps,
    prevId: progression.prevId,
    nextId: progression.nextId,
  } : null
}

function cloneGame(game: Game): Game {
  return {
    id: game.id,
    title: game.title,
    category: game.category,
    subcategory: game.subcategory ?? '',
    source: game.source,
    level: game.level,
    type: game.type,
    startingPosition: game.startingPosition,
    players: game.players.map(clonePlayer),
    constraints: [...game.constraints],
    designRationale: game.designRationale,
    tags: [...game.tags],
    skills: [...game.skills],
    progression: cloneProgression(game.progression),
    sourceUrl: game.sourceUrl ?? null,
  }
}

function cloneDraft(draft: GameDraft): GameDraft {
  return {
    id: draft.id,
    sourceGameId: draft.sourceGameId,
    publishMode: draft.publishMode,
    game: cloneGame(draft.game),
    pendingCategory: draft.pendingCategory ? {
      label: draft.pendingCategory.label,
      emoji: draft.pendingCategory.emoji,
    } : null,
    revision: draft.revision,
    isPublishing: draft.isPublishing,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }
}

function blankPlayer(index: number): PlayerRole {
  return { role: `Player ${index + 1}`, objective: '', winCondition: '', constraints: [] }
}

export function createBlankGameDraft(id: string): GameDraft {
  if (!isNonEmptyString(id)) throw new Error('Invalid draft id.')
  const timestamp = new Date().toISOString()
  return {
    id,
    sourceGameId: null,
    publishMode: 'create',
    game: {
      id: `custom-${crypto.randomUUID()}`,
      title: '',
      category: 'guard-passing',
      subcategory: '',
      source: '',
      level: 'beginner',
      type: 'mixed',
      startingPosition: '',
      players: [blankPlayer(0), blankPlayer(1)],
      constraints: [],
      designRationale: '',
      tags: [],
      skills: ['connection'],
      progression: null,
      sourceUrl: null,
    },
    pendingCategory: null,
    revision: 0,
    isPublishing: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createGameDraftFromGame(
  id: string,
  game: Game,
  publishMode: DraftPublishMode,
  sourceGameId: string | null = game.id,
): GameDraft {
  if (!isNonEmptyString(id)) throw new Error('Invalid draft id.')
  if (publishMode !== 'create' && publishMode !== 'replace') throw new Error('Invalid draft publish mode.')
  if (sourceGameId !== null && !isNonEmptyString(sourceGameId)) throw new Error('Invalid source game id.')
  const clonedGame = cloneGame(game)
  if (!isDraftGame(clonedGame)) throw new Error('Invalid game for draft.')
  const timestamp = new Date().toISOString()
  return {
    id,
    sourceGameId,
    publishMode,
    game: clonedGame,
    pendingCategory: null,
    revision: 0,
    isPublishing: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function applyOnePatch(draft: GameDraft, patch: GameDraftPatch): GameDraft {
  if (patch.path === 'pendingCategory') {
    draft.pendingCategory = null
    return draft
  }

  if (patch.path === 'tags') {
    draft.game.tags = [...patch.value as string[]]
    return draft
  }

  if (patch.path.endsWith('.constraints')) {
    const playerMatch = patch.path.match(/^players\.([01])\.constraints$/)
    if (playerMatch) {
      const playerIndex = Number(playerMatch[1])
      draft.game.players[playerIndex] = {
        ...draft.game.players[playerIndex],
        constraints: [...patch.value as string[]],
      }
      return draft
    }
  }

  if (patch.path === 'pendingCategory.label' || patch.path === 'pendingCategory.emoji') {
    const field = patch.path.endsWith('.label') ? 'label' : 'emoji'
    draft.pendingCategory = { label: '', emoji: '', ...draft.pendingCategory, [field]: patch.value as string }
    return draft
  }

  const playerMatch = patch.path.match(/^players\.([01])\.(role|objective|winCondition)$/)
  if (playerMatch) {
    const playerIndex = Number(playerMatch[1])
    const field = playerMatch[2] as 'role' | 'objective' | 'winCondition'
    draft.game.players[playerIndex] = { ...draft.game.players[playerIndex], [field]: patch.value as string }
    return draft
  }

  const field = patch.path as 'title' | 'category' | 'subcategory' | 'level' | 'type' | 'source' | 'startingPosition' | 'designRationale'
  draft.game[field] = patch.value as never
  return draft
}

export function applyGameDraftPatches(draft: GameDraft, patches: GameDraftPatch[]): GameDraft {
  return patches.reduce((next, patch) => {
    if (!isGameDraftPatch(patch)) throw new Error('Invalid draft patch.')
    return applyOnePatch(next, patch)
  }, cloneDraft(draft))
}

export function isGameDraft(value: unknown): value is GameDraft {
  if (!isRecord(value) || !hasOnlyKeys(value, DRAFT_KEYS)) return false

  return isNonEmptyString(value.id)
    && (value.sourceGameId === null || isNonEmptyString(value.sourceGameId))
    && (value.publishMode === 'create' || value.publishMode === 'replace')
    && isDraftGame(value.game)
    && (value.pendingCategory === null || isPendingCategory(value.pendingCategory))
    && typeof value.revision === 'number'
    && Number.isInteger(value.revision)
    && value.revision >= 0
    && typeof value.isPublishing === 'boolean'
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt)
}

function readPatchAtPath(draft: GameDraft, path: GameDraftPatchPath): GameDraftPatch {
  if (path === 'pendingCategory') {
    if (draft.pendingCategory !== null) throw new Error('Cannot preserve a composite draft field.')
    return { path, value: null }
  }

  if (path === 'tags') return { path, value: [...draft.game.tags] }
  if (path.endsWith('.constraints')) {
    const playerIndex = Number(path.match(/^players\.([01])/)?.[1])
    return { path, value: [...draft.game.players[playerIndex].constraints] }
  }
  if (path === 'pendingCategory.label' || path === 'pendingCategory.emoji') {
    const field = path.endsWith('.label') ? 'label' : 'emoji'
    return { path, value: draft.pendingCategory?.[field] || '' }
  }

  const playerMatch = path.match(/^players\.([01])\.(role|objective|winCondition)$/)
  if (playerMatch) {
    const playerIndex = Number(playerMatch[1])
    const field = playerMatch[2] as 'role' | 'objective' | 'winCondition'
    return { path, value: draft.game.players[playerIndex][field] }
  }

  const field = path as 'title' | 'category' | 'subcategory' | 'level' | 'type' | 'source' | 'startingPosition' | 'designRationale'
  return { path, value: draft.game[field] || '' }
}

export function mergeRemoteDraft(local: GameDraft, remote: GameDraft, activePath: GameDraftPatchPath | null): GameDraft {
  if (!activePath) return cloneDraft(remote)
  if (activePath === 'pendingCategory' && local.pendingCategory !== null) {
    const merged = cloneDraft(remote)
    merged.pendingCategory = {
      label: local.pendingCategory.label,
      emoji: local.pendingCategory.emoji,
    }
    return merged
  }
  return applyGameDraftPatches(remote, [readPatchAtPath(local, activePath)])
}
