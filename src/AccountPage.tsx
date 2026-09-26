import { useCallback, useEffect, useState } from 'react'
import { accountRequest, type Account, type AccountSession } from './accounts'
import { AcceptInvitation, InviteForm, PasswordForm } from './AccountSignIn'

export default function AccountPage({ session, error, onRefresh, onLegacySignIn, onLegacySignOut }: {
  session: AccountSession | null; error: string; onRefresh: () => Promise<void>;
  onLegacySignIn: () => void; onLegacySignOut: () => Promise<void>
}) {
  const [users, setUsers] = useState<Account[]>([])
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<{ url: string; email: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const token = new URLSearchParams(window.location.hash.slice(1)).get('invite')
  const loadUsers = useCallback(async () => {
    if (!session?.isAdmin) { setUsers([]); return }
    const data = await accountRequest<{ users: Account[] }>('/api/accounts')
    setUsers(data.users)
  }, [session?.isAdmin])
  useEffect(() => { void loadUsers().catch(cause => setActionError(cause.message)) }, [loadUsers])
  async function act(path: string, method = 'POST', body?: unknown) {
    setBusy(true); setActionError('')
    try { await accountRequest(path, method, body); await onRefresh(); await loadUsers().catch(() => setUsers([])) }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Please try again.') }
    finally { setBusy(false) }
  }
  async function invite(body: unknown) {
    setBusy(true); setActionError(''); setLink(null); setCopied(false)
    try {
      const result = await accountRequest<{ token: string; email: string }>('/api/auth/invite', 'POST', body)
      setLink({ url: `${window.location.origin}/?account=1#invite=${result.token}`, email: result.email }); await loadUsers()
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Unable to create invitation.') }
    finally { setBusy(false) }
  }
  if (token) return <AcceptInvitation token={token} onRefresh={onRefresh} />
  return <section className="account-page">
    <div className="card account-card">
      <p className="sessions-eyebrow">ØkoJitsu coaches</p>
      <h1>Your account</h1>
      {(error || actionError) && <p role="alert" className="builder-session-error">{error || actionError}</p>}
      {!session ? <><p>{error ? 'Your account could not be loaded.' : 'Loading your account…'}</p><button className="btn btn-secondary" onClick={() => void onRefresh()}>Retry</button></> : <>
        {!session.identity ? <><p>Sign in with your ØkoJitsu email and password.</p><PasswordForm mode="login" onRefresh={onRefresh} /><p>New coach or forgotten password? Ask an admin for a setup link.</p></> : <>
          <h2>{session.user?.name || session.identity.name}</h2>
          <p className="account-email">{session.identity.email}</p>
          {session.user?.status === 'active' ? <p className="account-role">{session.user.role === 'admin' ? 'Admin' : 'Coach'} · Active</p>
            : session.user?.status === 'pending' ? <p>Your account setup is not finished. Open the latest setup link from an admin.</p>
            : session.user?.status === 'disabled' ? <p>Your editing access is disabled. Contact an admin to restore it.</p>
            : <p>Ask an admin for a setup link.</p>}
          {session.user?.status === 'active' && (session.authMethod === 'previous-account' ? <><p>Set an ØkoJitsu password to keep your existing account and sessions. Future sign-ins use your email and password.</p><PasswordForm mode="migrate" onRefresh={onRefresh} /></> : <details className="account-setup"><summary>Change password</summary><PasswordForm mode="change" onRefresh={onRefresh} /></details>)}
          <div className="account-actions"><button className="btn btn-secondary" onClick={() => void onRefresh()}>Refresh access</button><form action="/api/account/sign-out" method="post" target="_top"><button className="btn btn-secondary" type="submit">Sign out</button></form></div>
        </>}
        {session.legacyEnabled && <details className="account-setup">
          <summary>Existing admin setup</summary>
          <p>Enter the existing admin password, then invite yourself below with the Admin role. Open the link to choose your personal password. Shared password access closes after two password-enabled admins are active.</p>
          {!session.legacyAdmin ? <button className="btn btn-secondary" onClick={onLegacySignIn}>Enter existing admin password</button> : <>
            <button className="btn btn-secondary" onClick={() => void onLegacySignOut().then(onRefresh).catch(cause => setActionError(cause.message))}>End shared admin session</button>
          </>}
        </details>}
        {!session.user && <details className="account-setup"><summary>Already used the previous sign-in?</summary><p>If you already activated a ChatGPT-based account, open it once to set an ØkoJitsu password and keep your sessions.</p><a className="btn btn-secondary" href="/signin-with-chatgpt?return_to=%2F%3Faccount%3D1" target="_top">Open previous account</a></details>}
      </>}
    </div>
    {session?.isAdmin && <div className="card account-card">
      <div className="account-heading"><div><p className="sessions-eyebrow">Admin</p><h2>Coach access</h2></div><button className="btn btn-secondary" disabled={busy} onClick={() => void loadUsers().catch(cause => setActionError(cause.message))}>Refresh users</button></div>
      <InviteForm onInvite={invite} busy={busy} />
      {link && <div className="account-invitation" role="status"><strong>Setup link for {link.email}</strong><p>Share this privately with that person. It expires in 48 hours and works once. No email is sent automatically.</p><textarea aria-label="Invitation link" readOnly value={link.url} onFocus={event => event.target.select()} /><button className="btn btn-secondary" onClick={() => void navigator.clipboard.writeText(link.url).then(() => setCopied(true)).catch(() => setActionError('Select and copy the link above.'))}>{copied ? 'Copied' : 'Copy link'}</button></div>}
      {!users.length && <p>No coach accounts yet.</p>}
      <div className="account-users">{users.map(user => <div className="account-user" key={user.id}>
        <div><strong>{user.name}</strong><span className="account-email">{user.email}</span><span>{user.status === 'pending' ? 'Setup pending' : user.status === 'disabled' ? 'Disabled' : user.role === 'admin' ? 'Admin' : 'Coach'}</span></div>
        <div className="account-actions">
          {user.status === 'disabled' ? <button className="btn btn-primary" disabled={busy} onClick={() => void act('/api/accounts', 'PATCH', { id: user.id, role: 'coach', status: 'active' })}>Restore as coach</button> : <button className="btn btn-secondary" disabled={busy} onClick={() => void invite({ accountId: user.id })}>Create setup/reset link</button>}
          {user.status === 'active' && <button className="btn btn-secondary" disabled={busy} onClick={() => {
            if (window.confirm(`${user.role === 'admin' ? 'Remove admin access from' : 'Give full admin access to'} ${user.name}?`)) void act('/api/accounts', 'PATCH', { id: user.id, role: user.role === 'admin' ? 'coach' : 'admin', status: 'active' })
          }}>{user.role === 'admin' ? 'Make coach' : 'Make admin'}</button>}
          {user.status !== 'disabled' && <button className="btn btn-secondary" disabled={busy} onClick={() => {
            if (window.confirm(`Disable editing access for ${user.name}?`)) void act('/api/accounts', 'PATCH', { id: user.id, role: user.role, status: 'disabled' })
          }}>Disable access</button>}
        </div>
      </div>)}</div>
    </div>}
  </section>
}
