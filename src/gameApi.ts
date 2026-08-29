import type { CategoryMeta, CategoryMetaMap, Game } from './types'

export class GameApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GameApiError'
    this.status = status
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'Unable to update shared games.'
    throw new GameApiError(message, response.status)
  }
  return body as T
}

export async function fetchSharedGames() {
  const response = await fetch('/api/games', { credentials: 'same-origin' })
  return responseJson<{ games: Game[]; categories: CategoryMetaMap; deletedSeedGameIds: string[] }>(response)
}

export async function createSharedGame(game: Game) {
  const response = await fetch('/api/games', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(game),
  })
  const body = await responseJson<{ game: Game }>(response)
  return body.game
}

export async function replaceSharedGame(game: Game) {
  const response = await fetch(`/api/games/${encodeURIComponent(game.id)}`, {
    method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(game),
  })
  const body = await responseJson<{ game: Game }>(response)
  return body.game
}

export async function deleteSharedGame(id: string) {
  const response = await fetch(`/api/games/${encodeURIComponent(id)}`, {
    method: 'DELETE', credentials: 'same-origin',
  })
  if (!response.ok) await responseJson<never>(response)
}

export async function importSharedGames(games: Game[], categories: CategoryMetaMap) {
  const response = await fetch('/api/games/import', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ games, categories }),
  })
  return responseJson<{ imported: number }>(response)
}

export async function createSharedCategory(key: string, category: CategoryMeta) {
  const response = await fetch('/api/categories', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, category }),
  })
  const body = await responseJson<{ category: CategoryMeta }>(response)
  return body.category
}
