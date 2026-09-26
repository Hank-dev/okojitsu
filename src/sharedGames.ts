import type { CategoryMeta, CategoryMetaMap, Game, PlayerRole, Progression, Skill } from './types'

const SKILLS: ReadonlySet<string> = new Set(['connection', 'distance', 'destabilize', 'segment', 'isolate', 'immobilize'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isPlayerRole(value: unknown): value is PlayerRole {
  return isRecord(value)
    && isNonEmptyString(value.role)
    && typeof value.objective === 'string'
    && typeof value.winCondition === 'string'
    && isStringArray(value.constraints)
    && (value.taskFocus === undefined || isStringArray(value.taskFocus))
}

function isProgression(value: unknown): value is Progression | null {
  if (value === null) return true
  return isRecord(value)
    && isNonEmptyString(value.chain)
    && isNonEmptyString(value.chainLabel)
    && typeof value.step === 'number'
    && Number.isFinite(value.step)
    && typeof value.totalSteps === 'number'
    && Number.isFinite(value.totalSteps)
    && (value.prevId === null || typeof value.prevId === 'string')
    && (value.nextId === null || typeof value.nextId === 'string')
}

export function isGame(value: unknown): value is Game {
  if (!isRecord(value)) return false

  return isNonEmptyString(value.id)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.category)
    && (value.subcategory === undefined || typeof value.subcategory === 'string')
    && (value.subcategories === undefined || isStringArray(value.subcategories))
    && typeof value.source === 'string'
    && isNonEmptyString(value.level)
    && isNonEmptyString(value.type)
    && typeof value.startingPosition === 'string'
    && Array.isArray(value.players)
    && value.players.length > 0
    && value.players.every(isPlayerRole)
    && isStringArray(value.constraints)
    && (value.designRationale === undefined || typeof value.designRationale === 'string')
    && isStringArray(value.tags)
    && Array.isArray(value.skills)
    && value.skills.every(skill => typeof skill === 'string' && SKILLS.has(skill))
    && isProgression(value.progression)
    && (value.sourceUrl === undefined || value.sourceUrl === null || typeof value.sourceUrl === 'string')
}

export function getIncompleteGameFields(game: Game): string[] {
  const fields: string[] = []
  if (!game.title.trim()) fields.push('Title')
  if (!game.category.trim()) fields.push('Category')
  if (!game.startingPosition.trim()) fields.push('Starting position')
  if (!game.players.length) fields.push('At least one player task')
  game.players.forEach((player, index) => {
    if (!player.role.trim()) fields.push(`Player ${index + 1} role`)
    if (!player.objective.trim()) fields.push(`Player ${index + 1} task objective`)
  })
  return fields
}

export function isCategoryMeta(value: unknown): value is CategoryMeta {
  return isRecord(value)
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.emoji)
    && isNonEmptyString(value.color)
    && typeof value.description === 'string'
    && (value.image === undefined || typeof value.image === 'string')
    && (value.subcategories === undefined || isStringArray(value.subcategories))
}

export function isCategoryKey(value: unknown): value is string {
  return isNonEmptyString(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

export function isCategoryMetaMap(value: unknown): value is CategoryMetaMap {
  return isRecord(value) && Object.entries(value).every(([key, meta]) => isCategoryKey(key) && isCategoryMeta(meta))
}

export function parseGamePayload(value: string): Game | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return isGame(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function parseCategoryPayload(value: string): CategoryMeta | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return isCategoryMeta(parsed) ? parsed : null
  } catch {
    return null
  }
}
