export type AccountRole = 'admin' | 'coach'
export type AccountStatus = 'pending' | 'active' | 'disabled'
export interface Account {
  id: string
  name: string
  email: string
  role: AccountRole
  status: AccountStatus
}
export interface AccountSession {
  authMethod?: 'password' | 'previous-account' | null
  identity: { name: string; email: string } | null
  user: Account | null
  isAdmin: boolean
  legacyAdmin: boolean
  legacyEnabled: boolean
}
export function canManageSession(isAdmin: boolean, userId: string | undefined, ownerId?: string | null) {
  return isAdmin || Boolean(userId && ownerId === userId)
}
export async function accountRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, credentials: 'same-origin',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Unable to update your account. Please try again.')
  return data as T
}
