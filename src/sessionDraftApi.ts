import type { SessionPlan } from './types'
import type { SessionDraft, SessionDraftPatch, SessionDraftSummary } from './sharedSessionDrafts'

export class SessionDraftApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'SessionDraftApiError' }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error : 'Unable to update live session drafts.'
    throw new SessionDraftApiError(message, response.status)
  }
  return body as T
}

export async function fetchSessionDrafts() {
  return (await responseJson<{ drafts: SessionDraftSummary[] }>(await fetch('/api/session-drafts', { credentials: 'same-origin' }))).drafts
}
export async function createSessionDraft(draft: SessionDraft) {
  return (await responseJson<{ draft: SessionDraft }>(await fetch('/api/session-drafts', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) }))).draft
}
export async function fetchSessionDraft(id: string) {
  return (await responseJson<{ draft: SessionDraft }>(await fetch(`/api/session-drafts/${encodeURIComponent(id)}`, { credentials: 'same-origin' }))).draft
}
export async function patchSessionDraft(id: string, patches: SessionDraftPatch[]) {
  return (await responseJson<{ draft: SessionDraft }>(await fetch(`/api/session-drafts/${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patches }) }))).draft
}
export async function publishSessionDraft(id: string) {
  return (await responseJson<{ session: SessionPlan }>(await fetch(`/api/session-drafts/${encodeURIComponent(id)}/publish`, { method: 'POST', credentials: 'same-origin' }))).session
}
export async function deleteSessionDraft(id: string) {
  const response = await fetch(`/api/session-drafts/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
  if (!response.ok) await responseJson<never>(response)
}
