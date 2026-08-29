import type { SessionGame, SessionPlan } from './types'

export type LegacySessionParse = {
  sessions: SessionPlan[]
  ignoredCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isSessionGame(value: unknown): value is SessionGame {
  if (!isRecord(value)) return false

  return (
    isNonEmptyString(value.gameId) &&
    isNonNegativeNumber(value.duration) &&
    (value.notes === undefined || typeof value.notes === 'string')
  )
}

export function isSessionPlan(value: unknown): value is SessionPlan {
  if (!isRecord(value) || !Array.isArray(value.games)) return false

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.date) &&
    isNonNegativeNumber(value.duration) &&
    isNonEmptyString(value.level) &&
    typeof value.focus === 'string' &&
    typeof value.notes === 'string' &&
    value.games.every(isSessionGame)
  )
}

export function parseLegacySessions(raw: string | null, seedIds: ReadonlySet<string>): LegacySessionParse {
  if (!raw) return { sessions: [], ignoredCount: 0 }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { sessions: [], ignoredCount: 0 }
  }

  if (!Array.isArray(parsed)) return { sessions: [], ignoredCount: 0 }

  const ids = new Set<string>()
  const sessions: SessionPlan[] = []
  let ignoredCount = 0

  for (const candidate of parsed) {
    if (!isSessionPlan(candidate) || seedIds.has(candidate.id) || ids.has(candidate.id)) {
      ignoredCount += 1
      continue
    }

    ids.add(candidate.id)
    sessions.push(candidate)
  }

  return { sessions, ignoredCount }
}
