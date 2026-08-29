export async function getAdminSession(): Promise<boolean> {
  const response = await fetch('/api/admin/session', { credentials: 'same-origin' })
  return response.ok && (await response.json()).isAdmin === true
}

export async function signInAdmin(password: string): Promise<boolean> {
  const response = await fetch('/api/admin/sign-in', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return response.ok
}

export async function signOutAdmin(): Promise<void> {
  await fetch('/api/admin/sign-out', { method: 'POST', credentials: 'same-origin' })
}
