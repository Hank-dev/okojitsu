import { useEffect, useState } from 'react'
import { accountRequest } from './accounts'

export function PasswordForm({ mode, email = '', name = '', token, onRefresh }: {
  mode: 'login' | 'setup' | 'change' | 'migrate'; email?: string; name?: string; token?: string; onRefresh: () => Promise<void>
}) {
  const [values, setValues] = useState({ email, name, password: '', currentPassword: '' })
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const update = (key: keyof typeof values, value: string) => { setValues(previous => ({ ...previous, [key]: value })); setError('') }
  return <form className="account-form" onSubmit={async event => {
    event.preventDefault(); setError(''); setNotice('')
    if (mode !== 'login' && values.password !== confirmation) { setError('The passwords do not match.'); return }
    setBusy(true)
    try {
      const path = mode === 'setup' ? 'accept' : mode === 'change' ? 'change-password' : mode
      await accountRequest(`/api/auth/${path}`, 'POST', { ...values, token })
      setValues(previous => ({ ...previous, password: '', currentPassword: '' })); setConfirmation('')
      if (mode === 'setup') { window.location.assign('/?account=1'); return }
      await onRefresh(); setNotice(mode === 'login' ? 'Signed in.' : 'Your password is saved.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.') }
    finally { setBusy(false) }
  }}>
    {(mode === 'login' || mode === 'setup') && <label>Email<input type="email" autoComplete="username" required readOnly={mode === 'setup'} value={values.email} onChange={event => update('email', event.target.value)} /></label>}
    {mode === 'setup' && <label>Your name<input autoComplete="name" required maxLength={100} value={values.name} onChange={event => update('name', event.target.value)} /></label>}
    {mode === 'change' && <label>Current password<input type="password" autoComplete="current-password" required maxLength={256} value={values.currentPassword} onChange={event => update('currentPassword', event.target.value)} /></label>}
    <label>{mode === 'login' ? 'Password' : 'New password'}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 15} maxLength={256} value={values.password} onChange={event => update('password', event.target.value)} /></label>
    {mode !== 'login' && <><p>Use at least 15 characters. A few memorable words work well.</p><label>Confirm new password<input type="password" autoComplete="new-password" required minLength={15} maxLength={256} value={confirmation} onChange={event => { setConfirmation(event.target.value); setError('') }} /></label></>}
    {error && <p className="builder-session-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'setup' ? 'Set password and sign in' : 'Save new password'}</button>
  </form>
}

export function AcceptInvitation({ token, onRefresh }: { token: string; onRefresh: () => Promise<void> }) {
  const [invitation, setInvitation] = useState<{ name: string; email: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    void accountRequest<{ name: string; email: string }>('/api/auth/invitation', 'POST', { token })
      .then(value => { if (current) setInvitation(value) }).catch(cause => { if (current) setError(cause.message) })
    return () => { current = false }
  }, [token])
  return <section className="account-page"><div className="card account-card"><h1>Set your ØkoJitsu password</h1>
    {error ? <p role="alert">{error}</p> : invitation ? <PasswordForm mode="setup" {...invitation} token={token} onRefresh={onRefresh} /> : <p>Checking your invitation…</p>}
    <a href="/?account=1">Back to sign in</a>
  </div></section>
}

export function InviteForm({ onInvite, busy }: { onInvite: (body: unknown) => Promise<void>; busy: boolean }) {
  const [values, setValues] = useState({ name: '', email: '', role: 'coach' })
  return <form className="account-form" onSubmit={event => { event.preventDefault(); void onInvite(values) }}>
    <h3>Invite a coach</h3>
    <label>Name<input required maxLength={100} value={values.name} onChange={event => setValues(previous => ({ ...previous, name: event.target.value }))} /></label>
    <label>Email<input type="email" required autoComplete="off" value={values.email} onChange={event => setValues(previous => ({ ...previous, email: event.target.value }))} /></label>
    <label>Role<select value={values.role} onChange={event => setValues(previous => ({ ...previous, role: event.target.value }))}><option value="coach">Coach</option><option value="admin">Admin</option></select></label>
    <button className="btn btn-primary" disabled={busy} type="submit">Create invitation link</button>
  </form>
}
