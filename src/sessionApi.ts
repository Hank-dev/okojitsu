import type { SessionPlan } from './types'

export class SessionApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SessionApiError'
    this.status = status
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'Unable to update shared sessions.'
    throw new SessionApiError(message, response.status)
  }
  return body as T
}

export async function fetchSharedSessions() {
  const response = await fetch('/api/sessions', { credentials: 'same-origin' })
  const body = await responseJson<{ sessions: SessionPlan[] }>(response)
  return body.sessions
}

export async function createSharedSession(session: SessionPlan) {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(session),
  })
  const body = await responseJson<{ session: SessionPlan }>(response)
  return body.session
}

export async function replaceSharedSession(session: SessionPlan) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(session),
  })
  const body = await responseJson<{ session: SessionPlan }>(response)
  return body.session
}

export async function deleteSharedSession(id: string) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  if (!response.ok) await responseJson<never>(response)
}

export async function importSharedSessions(sessions: SessionPlan[]) {
  const response = await fetch('/api/sessions/import', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessions }),
  })
  return responseJson<{ imported: number }>(response)
}
