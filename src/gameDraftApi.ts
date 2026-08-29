import type { Game } from './types'
import type { GameDraft, GameDraftPatch, GameDraftSummary } from './sharedGameDrafts'

export class GameDraftApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GameDraftApiError'
    this.status = status
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'Unable to update live game drafts.'
    throw new GameDraftApiError(message, response.status)
  }
  return body as T
}

export async function fetchGameDrafts() {
  const response = await fetch('/api/game-drafts', { credentials: 'same-origin' })
  const body = await responseJson<{ drafts: GameDraftSummary[] }>(response)
  return body.drafts
}

export async function createGameDraft(draft: GameDraft) {
  const response = await fetch('/api/game-drafts', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
  })
  const body = await responseJson<{ draft: GameDraft }>(response)
  return body.draft
}

export async function fetchGameDraft(id: string) {
  const response = await fetch(`/api/game-drafts/${encodeURIComponent(id)}`, { credentials: 'same-origin' })
  const body = await responseJson<{ draft: GameDraft }>(response)
  return body.draft
}

export async function patchGameDraft(id: string, patches: GameDraftPatch[]) {
  const response = await fetch(`/api/game-drafts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ patches }),
  })
  const body = await responseJson<{ draft: GameDraft }>(response)
  return body.draft
}

export async function publishGameDraft(id: string) {
  const response = await fetch(`/api/game-drafts/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    credentials: 'same-origin',
  })
  const body = await responseJson<{ game: Game }>(response)
  return body.game
}

export async function deleteGameDraft(id: string) {
  const response = await fetch(`/api/game-drafts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  if (!response.ok) await responseJson<never>(response)
}
