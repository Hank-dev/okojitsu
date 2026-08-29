import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { CategoryMetaMap, Game, SessionPlan, SessionGame } from './types'
import { CATEGORY_META, LEVEL_META, TYPE_META, SKILL_META, SKILL_ORDER } from './types'
import type { Skill } from './types'
import theoryFullData from './data/theory-full.json'
import coachingFullData from './data/coaching-full.json'
import { SEED_SESSIONS } from './data/sessions-seed'
import gamesData from './data/games.json'
import { generateSession } from './sessionGenerator'
import type { GenerateOptions, GeneratedSession } from './sessionGenerator'
import { getSuggestions } from './suggestionEngine'
import type { Suggestion } from './suggestionEngine'
import { getAdminSession, signInAdmin, signOutAdmin } from './adminAuth'
import { reorderSessionGames } from './sessions'
import { deleteSharedSession, fetchSharedSessions, importSharedSessions } from './sessionApi'
import { createSessionDraft, fetchSessionDraft, fetchSessionDrafts } from './sessionDraftApi'
import { deleteSharedGame, fetchSharedGames, importSharedGames } from './gameApi'
import { createGameDraft, fetchGameDraft, fetchGameDrafts } from './gameDraftApi'
import { parseLegacySessions, type LegacySessionParse } from './sharedSessions'
import { countGamesByCategory, filterGames, gameMatchesSearch, getPlayerGoalType, sortGames } from './library'
import type { LibrarySort } from './library'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import SessionsPage from './SessionsPage'
import FieldManualPage from './FieldManualPage'
import type { ManualArticle } from './fieldManual'
import { BEGINNER_SEMESTER } from './data/beginner-curriculum'
import { createBlankGameDraft, createGameDraftFromGame, type GameDraft, type GameDraftPatch, type GameDraftPatchPath, type GameDraftSummary } from './sharedGameDrafts'
import { useLiveGameDraft } from './useLiveGameDraft'
import { createBlankSessionDraft, createSessionDraftFromSession, type SessionDraft, type SessionDraftSummary } from './sharedSessionDrafts'
import { useLiveSessionDraft } from './useLiveSessionDraft'

const GAMES: Game[] = gamesData as Game[]
const CATEGORY_CREATE_VALUE = '__create-category__'
const CUSTOM_CATEGORIES_KEY = 'okojitsu_custom_categories'

type Page = 'home' | 'theory' | 'library' | 'builder' | 'sessions' | 'curriculum' | 'coaching' | 'memes' | 'resources'

const SESSIONS_KEY = 'okojitsu_sessions'
const DELETED_SEEDS_KEY = 'okojitsu_deleted_seeds'
const SHARED_GAME_REFRESH_INTERVAL_MS = 4_000

type SessionSyncStatus = 'loading' | 'ready' | 'error'

function readLegacySessions(): LegacySessionParse {
  return parseLegacySessions(localStorage.getItem(SESSIONS_KEY), new Set(SEED_SESSIONS.map(session => session.id)))
}

function readableSessionError(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to reach the shared session list.'
}

const GAME_TIME_KEY = 'okojitsu_game_times'
function loadGameTimes(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(GAME_TIME_KEY) || '{}') }
  catch { return {} }
}
function saveGameTimes(t: Record<string, number>) { localStorage.setItem(GAME_TIME_KEY, JSON.stringify(t)) }

const CUSTOM_GAMES_KEY = 'okojitsu_custom_games'

function readCustomCategories(): CategoryMetaMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false
      const meta = value as Partial<{ label: unknown; emoji: unknown; color: unknown; description: unknown }>
      return typeof meta.label === 'string' && typeof meta.emoji === 'string' && typeof meta.color === 'string' && typeof meta.description === 'string'
    })) as CategoryMetaMap
  } catch {
    return {}
  }
}

function readLegacyCustomGames(): Game[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CUSTOM_GAMES_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter((game): game is Game => Boolean(game && typeof game === 'object' && typeof (game as Game).id === 'string')).map(game => ({ ...game, level: 'beginner' }))
      : []
  } catch {
    return []
  }
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [sessions, setSessions] = useState<SessionPlan[]>([])
  const [sessionSyncStatus, setSessionSyncStatus] = useState<SessionSyncStatus>('loading')
  const [sessionSyncError, setSessionSyncError] = useState('')
  const [legacySessionImport, setLegacySessionImport] = useState<LegacySessionParse>(() => readLegacySessions())
  const [isPublishingLegacySessions, setIsPublishingLegacySessions] = useState(false)
  const sessionRequestIdRef = useRef(0)
  const gameRequestIdRef = useRef(0)
  const gameRefreshInFlightRef = useRef(false)
  const [customGames, setCustomGames] = useState<Game[]>([])
  const [customCategories, setCustomCategories] = useState<CategoryMetaMap>({})
  const [deletedSeedGameIds, setDeletedSeedGameIds] = useState<string[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [liveSessionDrafts, setLiveSessionDrafts] = useState<SessionDraftSummary[]>([])
  const [activeSessionDraft, setActiveSessionDraft] = useState<SessionDraft | null>(null)
  const [sessionDraftError, setSessionDraftError] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const gameCount = GAMES.length - deletedSeedGameIds.length + customGames.length
  const categoryMeta = useMemo(() => ({ ...CATEGORY_META, ...customCategories }), [customCategories])
  const categoryCount = Object.keys(categoryMeta).length

  useEffect(() => { void getAdminSession().then(setIsAdmin) }, [])

  const refreshLiveSessionDrafts = useCallback(async () => {
    if (!isAdmin) { setLiveSessionDrafts([]); return }
    try { setLiveSessionDrafts(await fetchSessionDrafts()) } catch { /* Drafts remain retryable from the workbench. */ }
  }, [isAdmin])

  useEffect(() => {
    void refreshLiveSessionDrafts()
    if (!isAdmin) return
    const interval = window.setInterval(() => void refreshLiveSessionDrafts(), 1000)
    return () => window.clearInterval(interval)
  }, [isAdmin, refreshLiveSessionDrafts])

  const refreshSharedSessions = useCallback(async () => {
    const requestId = ++sessionRequestIdRef.current
    setSessionSyncStatus('loading')
    setSessionSyncError('')
    try {
      const loaded = await fetchSharedSessions()
      if (requestId !== sessionRequestIdRef.current) return
      setSessions(loaded)
      setSessionSyncStatus('ready')
    } catch (error) {
      if (requestId !== sessionRequestIdRef.current) return
      setSessionSyncError(readableSessionError(error))
      setSessionSyncStatus('error')
    }
  }, [])

  useEffect(() => { void refreshSharedSessions() }, [refreshSharedSessions])

  const refreshSharedGames = useCallback(async () => {
    if (gameRefreshInFlightRef.current) return

    gameRefreshInFlightRef.current = true
    const requestId = ++gameRequestIdRef.current
    try {
      const loaded = await fetchSharedGames()
      let nextGames = loaded.games.map(game => ({ ...game, level: 'beginner' }))
      let nextCategories = loaded.categories
      const nextDeletedSeedGameIds = loaded.deletedSeedGameIds

      if (isAdmin) {
        const legacyGames = readLegacyCustomGames()
        const legacyCategories = readCustomCategories()
        const remoteGameIds = new Set(nextGames.map(game => game.id))
        const gamesToImport = legacyGames.filter(game => !remoteGameIds.has(game.id))
        const categoriesToImport = Object.fromEntries(Object.entries(legacyCategories).filter(([key]) => !nextCategories[key])) as CategoryMetaMap
        if (gamesToImport.length > 0 || Object.keys(categoriesToImport).length > 0) {
          await importSharedGames(gamesToImport, categoriesToImport)
          nextGames = [...nextGames, ...gamesToImport]
          nextCategories = { ...nextCategories, ...categoriesToImport }
          localStorage.removeItem(CUSTOM_GAMES_KEY)
          localStorage.removeItem(CUSTOM_CATEGORIES_KEY)
        }
      }

      if (requestId !== gameRequestIdRef.current) return
      setCustomGames(nextGames)
      setCustomCategories(nextCategories)
      setDeletedSeedGameIds(nextDeletedSeedGameIds)
    } catch {
      if (requestId !== gameRequestIdRef.current) return
      setCustomGames(readLegacyCustomGames())
      setCustomCategories(readCustomCategories())
      setDeletedSeedGameIds([])
    } finally {
      gameRefreshInFlightRef.current = false
    }
  }, [isAdmin])

  useEffect(() => {
    void refreshSharedGames()

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshSharedGames()
    }
    const interval = window.setInterval(refreshWhenVisible, SHARED_GAME_REFRESH_INTERVAL_MS)

    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('online', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('online', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      gameRequestIdRef.current += 1
    }
  }, [refreshSharedGames])

  const removeSharedGame = useCallback(async (id: string) => {
    await deleteSharedGame(id)
    gameRequestIdRef.current += 1
    setCustomGames(current => current.filter(game => game.id !== id))
    setDeletedSeedGameIds(current => current.includes(id) ? current : [...current, id])
  }, [])
  const removeSharedSession = useCallback(async (id: string) => {
    try {
      await deleteSharedSession(id)
      sessionRequestIdRef.current += 1
      setSessions(current => current.filter(session => session.id !== id))
      setSessionSyncError('')
      setSessionSyncStatus('ready')
    } catch (error) {
      setSessionSyncError(readableSessionError(error))
      setSessionSyncStatus('error')
    }
  }, [])

  const publishLegacySessions = useCallback(async () => {
    if (legacySessionImport.sessions.length === 0) return

    setIsPublishingLegacySessions(true)
    try {
      await importSharedSessions(legacySessionImport.sessions)
      localStorage.removeItem(SESSIONS_KEY)
      localStorage.removeItem(DELETED_SEEDS_KEY)
      setLegacySessionImport({ sessions: [], ignoredCount: 0 })
      await refreshSharedSessions()
    } catch (error) {
      setSessionSyncError(readableSessionError(error))
      setSessionSyncStatus('error')
    } finally {
      setIsPublishingLegacySessions(false)
    }
  }, [legacySessionImport.sessions, refreshSharedSessions])

  const ALL_GAMES = useMemo(() => [...GAMES.filter(game => !deletedSeedGameIds.includes(game.id)), ...customGames], [customGames, deletedSeedGameIds])

  const startLiveSessionDraft = async (copy?: SessionPlan) => {
    setSessionDraftError('')
    try {
      const draft = copy
        ? createSessionDraftFromSession(`session-draft-${crypto.randomUUID()}`, copy)
        : createBlankSessionDraft(`session-draft-${crypto.randomUUID()}`)
      const opened = await createSessionDraft(draft)
      setActiveSessionDraft(opened)
      setPage('builder')
      await refreshLiveSessionDrafts()
    } catch (error) {
      setSessionDraftError(error instanceof Error ? error.message : 'Unable to start a shared session draft.')
    }
  }
  const openLiveSessionDraft = async (id: string) => {
    setSessionDraftError('')
    try {
      setActiveSessionDraft(await fetchSessionDraft(id))
      setPage('builder')
    } catch (error) {
      setSessionDraftError(error instanceof Error ? error.message : 'Unable to open that shared session draft.')
    }
  }
  const finishLiveSessionDraft = async (session?: SessionPlan) => {
    if (session) setSessions(current => [session, ...current.filter(existing => existing.id !== session.id)])
    else await refreshSharedSessions()
    setActiveSessionDraft(null)
    await refreshLiveSessionDrafts()
  }

  const navTo = (p: Page) => { setPage(p); setMobileMenuOpen(false) }
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!await signInAdmin(password)) {
      setLoginError('Incorrect password')
      return
    }
    setIsAdmin(true)
    setPassword('')
    setLoginError('')
    setLoginOpen(false)
  }
  const signOut = async () => {
    await signOutAdmin()
    setIsAdmin(false)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo" onClick={() => navTo('home')}>
          <span className="header-logo-icon">{'\u00D8'}</span>
          <span>{'\u00D8'}koJitsu</span>
        </div>
        <nav className={`header-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => navTo('home')}>Home</button>
          <button className={`nav-item ${page === 'theory' ? 'active' : ''}`} onClick={() => navTo('theory')}>Theory</button>
          <button className={`nav-item ${page === 'library' ? 'active' : ''}`} onClick={() => navTo('library')}>Game Library</button>
          <button className={`nav-item ${page === 'builder' ? 'active' : ''}`} onClick={() => navTo('builder')}>Class Builder</button>
          <button className={`nav-item ${page === 'sessions' ? 'active' : ''}`} onClick={() => navTo('sessions')}>My Sessions</button>
          <button className={`nav-item ${page === 'coaching' ? 'active' : ''}`} onClick={() => navTo('coaching')}>Coaching</button>
          <button className={`nav-item ${page === 'memes' ? 'active' : ''}`} onClick={() => navTo('memes')}>Memes</button>
          <button className={`nav-item ${page === 'resources' ? 'active' : ''}`} onClick={() => navTo('resources')}>Resources</button>
        </nav>
        {isAdmin ? (
          <button className="admin-control admin-active" onClick={signOut}>Admin · Sign out</button>
        ) : (
          <button className="admin-control" onClick={() => { setLoginError(''); setLoginOpen(true) }}>Admin sign in</button>
        )}
        <button className={`hamburger ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}>
          <span />
          <span />
          <span />
        </button>
      </header>
      {mobileMenuOpen && <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}
      <main className="main">
        {page === 'home' && <HomePage setPage={setPage} />}
        {page === 'theory' && <TheoryPage />}
        {page === 'library' && <LibraryPage isAdmin={isAdmin} onSelect={setSelectedGame} customGames={customGames} deletedSeedGameIds={deletedSeedGameIds} categoryMeta={categoryMeta} refreshSharedGames={refreshSharedGames} onDeleteGame={removeSharedGame} />}
        {page === 'builder' && !isAdmin && <div className="admin-required"><h2>Admin access required</h2><p>Sign in from the upper-right corner to start or join a shared session draft.</p></div>}
        {page === 'builder' && isAdmin && (activeSessionDraft ? (
          <BuilderPage
            key={activeSessionDraft.id}
            draft={activeSessionDraft}
            games={ALL_GAMES}
            categoryMeta={categoryMeta}
            isAdmin={isAdmin}
            onPublished={session => { void finishLiveSessionDraft(session) }}
            onDiscarded={() => { void finishLiveSessionDraft() }}
            onClose={() => setActiveSessionDraft(null)}
            onRefreshGames={refreshSharedGames}
            onSelect={setSelectedGame}
          />
        ) : <SessionDraftStartPanel drafts={liveSessionDrafts} error={sessionDraftError} onStart={() => { void startLiveSessionDraft() }} onOpen={id => { void openLiveSessionDraft(id) }} />)}
        {page === 'sessions' && <SessionsPage
          isAdmin={isAdmin}
          sessions={sessions}
          games={ALL_GAMES}
          categoryMeta={categoryMeta}
          syncStatus={sessionSyncStatus}
          syncError={sessionSyncError}
          legacySessionImport={legacySessionImport}
          isPublishingLegacySessions={isPublishingLegacySessions}
          onRetry={refreshSharedSessions}
          onPublishLegacySessions={publishLegacySessions}
          onDeleteSession={removeSharedSession}
          liveSessionDrafts={liveSessionDrafts}
          sessionDraftError={sessionDraftError}
          onStartLiveSessionDraft={() => { void startLiveSessionDraft() }}
          onOpenLiveSessionDraft={id => { void openLiveSessionDraft(id) }}
          onCopyEdit={session => { void startLiveSessionDraft(session) }}
        />}
        {page === 'curriculum' && <CurriculumPage />}
        {page === 'coaching' && <CoachingPage />}
        {page === 'memes' && <MemesPage />}
        {page === 'resources' && <ResourcesPage />}
      </main>
      {selectedGame && <GameModal game={selectedGame} categoryMeta={categoryMeta} onClose={() => setSelectedGame(null)} onNavigate={(g) => setSelectedGame(g)} />}
      {loginOpen && <div className="modal-overlay" onClick={() => setLoginOpen(false)}>
        <div className="modal admin-login-modal" onClick={event => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setLoginOpen(false)} aria-label="Close admin sign in">✕</button>
          <h2>Admin sign in</h2>
          <p>Sign in to create or change shared games and sessions.</p>
          <form onSubmit={signIn}>
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" autoFocus value={password} onChange={event => { setPassword(event.target.value); setLoginError('') }} />
            {loginError && <div className="admin-login-error" role="alert">{loginError}</div>}
            <button className="btn btn-primary" type="submit">Sign in</button>
          </form>
        </div>
      </div>}
    </div>
  )
}

function SessionDraftStartPanel({ drafts, error, onStart, onOpen }: { drafts: SessionDraftSummary[]; error: string; onStart: () => void; onOpen: (id: string) => void }) {
  return (
    <section className="builder-layout" aria-labelledby="shared-session-drafts-heading">
      <div className="builder-main">
        <div className="card session-header-card" style={{ maxWidth: 760 }}>
          <p className="sessions-eyebrow">Collaborative planning</p>
          <h1 id="shared-session-drafts-heading" style={{ marginTop: 4 }}>Start a shared session</h1>
          <p style={{ color: 'var(--text-muted)', maxWidth: 580 }}>Create a live draft when you are ready to plan. Open the same draft from another signed-in browser and changes appear automatically.</p>
          <button type="button" className="btn btn-primary" onClick={onStart} style={{ marginTop: 12 }}>+ Start shared session</button>
          {error && <p className="builder-session-error" role="alert">{error}</p>}
        </div>
        <div className="card" style={{ maxWidth: 760, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}>
            <div><p className="sessions-eyebrow">Live session drafts</p><h2 style={{ marginTop: 4, fontSize: 20 }}>Continue planning</h2></div>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}</span>
          </div>
          {drafts.length ? <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{drafts.map(draft => (
            <button key={draft.id} type="button" className="sessions-browser-item" onClick={() => onOpen(draft.id)} style={{ textAlign: 'left' }}>
              <strong>{draft.title || 'Untitled session'}</strong><span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.updatedAt))}</span>
            </button>
          ))}</div> : <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>No live drafts yet. Start one when you want to collaborate.</p>}
        </div>
      </div>
    </section>
  )
}

function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div className="hero">
      <section className="hero-content">
        <h1>ØkoJitsu<br /><span className="hero-title-accent">4Lyfe</span></h1>
        <p className="hero-subtitle">
          Ecological jiu-jitsu: train through live games, not dead repetition.
          Browse CLA games and build classes.
        </p>
        <div className="hero-rule" />
        <blockquote className="hero-quote">
          {'\u201C'}Exposure and opportunity. You want to expose yourself to the problem.
          And whatever game you create needs to give you an opportunity to solve it.{'\u201D'}
          <cite>Greg Souders</cite>
        </blockquote>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => setPage('builder')}>Build today&apos;s class</button>
          <button className="btn btn-secondary" onClick={() => setPage('library')}>Browse the library</button>
        </div>
      </section>
      <div className="hero-visual">
        <img src="/img/frontpage.jpg" alt="ØkoJitsu ecological grappling" className="hero-image" />
      </div>
    </div>
  )
}

// ============ THEORY ============
const THEORY_FULL = (theoryFullData as ManualArticle[]).filter(article => article.id !== 'hidden-logic')
const COACHING_FULL = coachingFullData as ManualArticle[]

function TheoryPage() {
  return <FieldManualPage articles={THEORY_FULL} mode="theory" />
}

function CoachingPage() {
  return <FieldManualPage articles={COACHING_FULL} mode="coaching" />
}

function CurriculumPage() {
  const gameById = new Map(GAMES.map(game => [game.id, game]))

  return (
    <div className="curriculum-page">
      <p className="curriculum-eyebrow">Beginner semester · Mid-August to mid-December</p>
      <h1>Curriculum</h1>
      <p className="curriculum-format">18 sessions · 6 games per session · 6 minutes per game</p>
      <ol className="curriculum-list">
        {BEGINNER_SEMESTER.map(session => (
          <li key={session.week} className="curriculum-session">
            <div className="curriculum-session-heading"><span>Week {session.week}</span><h2>{session.focus}</h2></div>
            <ul className="curriculum-games">
              {session.games.map((item, index) => <li key={`${session.week}-${item.gameId}-${index}`}><span>{gameById.get(item.gameId)?.title ?? item.gameId}</span><small>6 min</small></li>)}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ============ MEMES ============
const MEME_IMAGES = [
  { src: '/img/meme-1.jpg', title: 'CLA Flowchart' },
  { src: '/img/meme-2.jpg', title: 'No Drilling' },
  { src: '/img/meme-3.jpg', title: 'Invariants' },
  { src: '/img/meme-4.jpg', title: 'Live Work Only' },
  { src: '/img/meme-5.jpg', title: 'Greg Energy' },
  { src: '/img/meme-6.jpg', title: 'Ecological BJJ' },
]

function MemesPage() {
  return (
    <div style={{ maxWidth: 1200, margin: '32px auto', padding: '0 28px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Memes</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>From the doc.</p>
      <div className="meme-grid">
        {MEME_IMAGES.map((m, i) => (
          <div key={i} className="meme-item">
            <img src={m.src} alt={m.title} className="meme-img" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ RESOURCES ============
const RESOURCES = {
  people: [
    { name: 'Greg Souders', handle: '@GD_STS', affiliation: 'Standard Jiu-Jitsu, Maryland', role: 'CLA Coach & Invariant Framework',
      desc: 'The primary source for the games and coaching methodology in this project. Greg runs Standard Jiu-Jitsu and teaches ecological jiu-jitsu through constrained live games. His invariant framework — make and maintain connection, manage distance, destabilize, segment, isolate, immobilize — is the lens through which all CLA games are designed.',
      links: [
        { label: 'Instagram', url: 'https://instagram.com/GD_STS' },
        { label: 'Spotify Playlist', url: 'https://open.spotify.com/playlist/6wDBsSfC7EINQuzwPhvuC6?si=d3f2ecc0335b420e' },
        { label: 'YouTube CLA Playlist', url: 'https://youtube.com/playlist?list=PLEmjNuJJkxDJFpzJqn3E4ZWSpFd02sZyx&si=Uy5ujjXo4OJfF_3c' },
      ] },
    { name: 'Rob Gray', handle: '@Shoeprize', affiliation: 'Arizona State University', role: 'Perception-Action Researcher',
      desc: 'Researcher and author whose work on ecological psychology and the Constraints-Led Approach provides the theoretical foundation for CLA in sports. His Perception Action Podcast is the best deep-dive resource on why ecological training works.',
      links: [
        { label: 'Perception Action Podcast', url: 'https://open.spotify.com/show/6P7OPFNTMnwRYjVsj8OYaM?si=c63b2e04bbd744e9' },
        { label: 'Book: How We Learn to Move', url: 'https://www.goodreads.com/book/show/59507312-how-we-learn-to-move' },
      ] },
  ],
  books: [
    { title: 'How We Learn to Move', author: 'Rob Gray (2024)', url: 'https://www.goodreads.com/book/show/59507312-how-we-learn-to-move',
      desc: 'The definitive book on ecological approaches to movement learning. Covers the science behind CLA and why constraints-based training works better than traditional instruction.' },
    { title: 'Constraints-Led Approach: Principles for Sports Coaching and Practice Design', author: 'Ian Renshaw, Keith Davids, Daniel Araujo', url: 'https://www.akademika.no/hjem-og-fritid/sport-og-friluft/constraints-led-approach/9781138104075',
      desc: 'Academic textbook on implementing CLA in sport. Provides the theoretical framework and practical examples across multiple sports.' },
  ],
  podcasts: [
    { title: 'Perception Action Podcast', host: 'Rob Gray', url: 'https://open.spotify.com/show/6P7OPFNTMnwRYjVsj8OYaM?si=c63b2e04bbd744e9',
      desc: 'The go-to podcast on ecological psychology and CLA in sports. Rob Gray breaks down research into actionable coaching insights.' },
    { title: 'Greg Souders Podcast Appearances', host: 'Various', url: 'https://open.spotify.com/playlist/6wDBsSfC7EINQuzwPhvuC6?si=d3f2ecc0335b420e',
      desc: 'Spotify playlist collecting Greg Souders podcast appearances covering CLA, coaching philosophy, and ecological dynamics.' },
    { title: 'BJJ Instructional Shortcuts Are A Lie — All You Need Is Live Work', host: 'Podcast #54', url: 'https://youtube.com/playlist?list=PLEmjNuJJkxDJFpzJqn3E4ZWSpFd02sZyx&si=Uy5ujjXo4OJfF_3c',
      desc: 'YouTube playlist featuring Greg Souders explaining CLA games, seminars, and coaching sessions at Standard Jiu-Jitsu.' },
  ],
  videos: [
    { title: 'CLA Games Video Series', source: 'YouTube', url: 'https://youtube.com/playlist?list=PLEmjNuJJkxDJDUg-UOFO_SpeKvusKIzmO&si=CiSLo8fCRBX-LMKc',
      desc: 'YouTube playlist with CLA game demonstrations and seminar recordings.' },
    { title: 'Seated Handfight — Philippines Seminar', source: 'YouTube', url: 'https://www.youtube.com/watch?v=kmU390aEbFQ',
      desc: 'Greg Souders teaching the seated handfight game at a seminar in the Philippines.' },
    { title: 'Stay Connected — B-Team Day 2', source: 'YouTube', url: 'https://www.youtube.com/watch?v=rv7_sUfup9o',
      desc: 'Greg at B-Team: bottom player explores connection as a task, not a win condition.' },
    { title: 'Whole Game / Stay Connected', source: 'YouTube', url: 'https://www.youtube.com/watch?v=EQ6GNe2tmXM&list=PLEmjNuJJkxDJDUg-UOFO_SpeKvusKIzmO&index=9',
      desc: 'Full game demonstration from the CLA Games video series.' },
  ],
  articles: [
    { title: 'How CLA Is Changing Sports Training', source: 'The Athletic / NYT', url: 'https://www.nytimes.com/athletic/6665943/2025/09/29/sports-training-cla-coaching-wembanyana-ohtani/',
      desc: 'Article on how CLA is being adopted by professional sports teams and elite athletes, including Wembanyama and Ohtani.' },
  ],
  peopleMentioned: [
    { name: 'John Danaher', desc: 'Elite grappler and instructor known for detailed technical instruction. The document argues that even Danaher\'s success comes from the live environment, not the instruction itself. His instructionals follow the same pattern: the first 5-20 minutes contain the entire framework as principles.' },
    { name: 'Gordon Ryan', desc: 'Five-time ADCC champion. His training methodology (start in live situations, figure out solutions in the moment) is used as evidence that even elite grapplers learn through trial and error and interaction with the live environment.' },
    { name: 'Ryan Hall', desc: 'BJJ black belt and ADCC medalist. His breakdown of the triangle into four conditions (threat, lock, angle, finish) is used as an example of low-variability submission analysis — submissions are explicit about what makes them work.' },
    { name: 'Claude (AI)', desc: 'This document was generated with the help of Claude AI to summarise and structure transcripts from Greg Souders, Rob Gray, and other sources. The AI organizes the theory but the ideas originate from the referenced coaches and researchers.' },
  ],
}

function ResourcesPage() {
  const rl = (label: string, url: string) => (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', textDecoration: 'none' }}>{label} ↗</a>
  )
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 28px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 }}>Resources</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>Books, podcasts, videos, articles, and people behind this project.</p>
      <div className="card" style={{ padding: 18, marginBottom: 36, borderLeft: '3px solid var(--accent)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📄 Original Source Document</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>The full Google Doc that started it all — every game, theory section, and coaching principle referenced here.</p>
        <a href="https://docs.google.com/document/d/10x8E97LfgZ7MycaNCqrEbS-hUZPXnVtuFE_Pvd8_V8Q/edit?usp=sharing" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px', textDecoration: 'none' }}>Open Original Document ↗</a>
      </div>

      {/* Source People */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, marginTop: 8 }}>Source People</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 40 }}>
        {RESOURCES.people.map((p, i) => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{p.role}</div>
                {p.affiliation && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.affiliation}</div>}
              </div>
              {p.handle && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.handle}</div>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 12px' }}>{p.desc}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.links?.map((l, li) => <span key={li}>{rl(l.label, l.url)}</span>)}
            </div>
          </div>
        ))}
      </div>

      {/* Books */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Books</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {RESOURCES.books.map((b, i) => (
          <div key={i} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{b.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{b.author}</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b.desc}</p>
              </div>
              {rl('View', b.url)}
            </div>
          </div>
        ))}
      </div>

      {/* Podcasts */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Podcasts</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {RESOURCES.podcasts.map((p, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{p.host}</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{p.desc}</p>
            {rl('Listen', p.url)}
          </div>
        ))}
      </div>

      {/* Videos */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Videos & Seminars</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 40 }}>
        {RESOURCES.videos.map((v, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{v.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{v.source}</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{v.desc}</p>
            {rl('Watch', v.url)}
          </div>
        ))}
      </div>

      {/* Articles */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Articles</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {RESOURCES.articles.map((a, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{a.source}</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{a.desc}</p>
              </div>
              {rl('Read', a.url)}
            </div>
          </div>
        ))}
      </div>

      {/* Also Mentioned */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Also Mentioned</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {RESOURCES.peopleMentioned.map((p, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{p.desc}</p>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', borderTop: '1px solid var(--border)' }}>
        This document was generated using AI to summarise transcripts from Greg Souders, Rob Gray, and other sources. Always verify with the original source material.
      </p>
    </div>
  )
}

function AtlasGameCard({ game, custom, categoryMeta, onOpen }: { game: Game; custom: boolean; categoryMeta: CategoryMetaMap; onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  const category = categoryMeta[game.category] ?? categoryMeta.submissions
  return (
    <button
      type="button"
      className="atlas-card"
      style={{ '--atlas-accent': category.color } as React.CSSProperties}
      onClick={onOpen}
      data-game-id={game.id}
    >
      <span className="atlas-card-kicker">{category.label}{game.subcategory ? ` · ${game.subcategory}` : ''}{custom ? ' · Custom' : ''}</span>
      <strong className="atlas-card-title">{game.title}</strong>
      <span className="atlas-card-summary">{game.designRationale || game.startingPosition}</span>
      <span className="atlas-card-duel">
        {game.players.slice(0, 2).map((player, index) => (
          <span key={index}>
            <small>{player.role} · {getPlayerGoalType(game, index)}</small>
            {player.objective && <b>{player.objective}</b>}
          </span>
        ))}
      </span>
      <span className="atlas-card-tags">
        <i>{LEVEL_META[game.level]?.label}</i>
        {game.skills.slice(0, 2).map(skill => <i key={skill}>{SKILL_META[skill]?.label}</i>)}
      </span>
      <span className="atlas-card-open">Open game <b aria-hidden="true">→</b></span>
    </button>
  )
}

function AtlasFeaturedGame({ game, categoryMeta, onOpen }: { game: Game; categoryMeta: CategoryMetaMap; onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  const category = categoryMeta[game.category] ?? categoryMeta.submissions
  return (
    <section
      className="atlas-featured"
      style={{ '--atlas-accent': category.color } as React.CSSProperties}
      aria-labelledby={`atlas-featured-title-${game.id}`}
    >
      <div className="atlas-featured-header">
        <span className="atlas-featured-kicker">Featured game · {category.label}{game.subcategory ? ` · ${game.subcategory}` : ''}</span>
        <span className="atlas-featured-type">{TYPE_META[game.type]?.label}</span>
      </div>
      <div className="atlas-featured-body">
        <div className="atlas-featured-copy">
          <h2 id={`atlas-featured-title-${game.id}`}>{game.title}</h2>
          <p>{game.designRationale || game.startingPosition}</p>
          <div className="atlas-featured-meta">
            <span>{LEVEL_META[game.level]?.label}</span>
            {game.skills.slice(0, 2).map(skill => <span key={skill}>{SKILL_META[skill]?.label}</span>)}
          </div>
          <button type="button" className="atlas-featured-open" onClick={onOpen} data-game-id={game.id}>
            Open game <b aria-hidden="true">→</b>
          </button>
        </div>
        <div className="atlas-featured-duel" aria-label="Player task focus">
          {game.players.slice(0, 2).map((player, index) => (
            <div key={index} className="atlas-featured-player">
              <small>{player.role} · {getPlayerGoalType(game, index)}</small>
              <strong>{player.objective}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============ GAME DETAIL INLINE ============
function GameDetailInline({ game, categoryMeta, onClose, onEdit, onDelete, onNavigate }: { game: Game; categoryMeta: CategoryMetaMap; onClose: () => void; onEdit?: () => void; onDelete?: () => void; onNavigate?: (g: Game) => void }) {
  const cat = categoryMeta[game.category] || categoryMeta['submissions']
  return (
    <div className="detail-panel">
      <div className="detail-header" style={{ borderLeftColor: cat.color }}>
        <div className="detail-header-text">
          <div className="detail-title">{game.title}</div>
          <div className="detail-badges">
            <span className={`mini-badge mini-level-${game.level}`}>{LEVEL_META[game.level]?.label}</span>
            <span className={`mini-badge mini-type-${game.type}`}>{TYPE_META[game.type]?.label}</span>
            <span className="detail-cat-label" style={{ color: cat.color }}>{cat.label}</span>
            {game.subcategory && <span className="detail-subcategory-label">{game.subcategory}</span>}
          </div>
          {game.skills?.length > 0 && (
            <div className="detail-skills">
              {game.skills.map(s => (
                <span key={s} className="skill-tag" style={{ '--skill-color': SKILL_META[s]?.color } as React.CSSProperties}>
                  {SKILL_META[s]?.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="detail-header-actions">
          {onEdit && <button className="detail-edit-btn" onClick={onEdit}>Edit</button>}
          {onDelete && <button className="detail-delete-btn" onClick={onDelete}>Delete</button>}
          <button className="detail-close-btn" onClick={onClose} aria-label="Close details">Close</button>
        </div>
      </div>
      <div className="detail-body">
        <div className="detail-section">
          <div className="detail-label">Starting Position</div>
          <div className="detail-text">{game.startingPosition}</div>
        </div>
        <div className="detail-section">
          <div className="detail-label">Players</div>
          <div className="detail-players">
            {game.players.map((p: any, i: number) => (
              <div key={i} className={`detail-player ${i === 0 ? 'detail-attacker' : 'detail-defender'}`}>
                <div className="detail-player-role">{p.role}</div>
                <span className={`detail-goal-type detail-goal-${getPlayerGoalType(game, i)}`}>
                  {getPlayerGoalType(game, i) === 'continuous' ? 'Continuous success condition' : 'Terminal win condition'}
                </span>
                {p.objective && <div className="detail-player-row"><span className="detail-field-key">Task focus</span><span className="detail-field-val">{p.objective}</span></div>}
                {p.winCondition && <div className="detail-player-row"><span className="detail-field-key">Condition</span><span className="detail-field-val detail-win">{p.winCondition}</span></div>}
                {p.constraints?.length > 0 && (
                  <div className="detail-player-row"><span className="detail-field-key">Constraints</span>
                    <ul className="detail-constraints">{p.constraints.map((c: string, ci: number) => <li key={ci}>{c}</li>)}</ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {game.constraints?.length > 0 && (
          <div className="detail-section">
            <div className="detail-label">Global rules</div>
            <ul className="detail-constraints detail-global-constraints">
              {game.constraints.map((constraint, index) => <li key={index}>{constraint}</li>)}
            </ul>
          </div>
        )}
        {game.designRationale && (
          <div className="detail-section">
            <div className="detail-label">Rationale</div>
            <div className="detail-rationale">{game.designRationale}</div>
          </div>
        )}
        {game.progression && (
          <div className="detail-section">
            <div className="detail-label">Progression — Step {game.progression.step} of {game.progression.totalSteps}</div>
            <div className="detail-progression">
              <div className="prog-dots">
                {Array.from({ length: game.progression.totalSteps }, (_, i) => (
                  <span key={i} className={`prog-dot ${i + 1 === game.progression!.step ? 'current' : i + 1 < game.progression!.step ? 'done' : ''}`} />
                ))}
              </div>
              <div className="prog-nav">
                {game.progression.prevId && (() => {
                  const prev = GAMES.find(g => g.id === game.progression!.prevId)
                  return prev ? <button className="prog-link prog-link-btn" onClick={() => onNavigate?.(prev)}>← {prev.title}</button> : null
                })()}
                {game.progression.nextId && (() => {
                  const next = GAMES.find(g => g.id === game.progression!.nextId)
                  return next ? <button className="prog-link prog-link-btn prog-link-next" onClick={() => onNavigate?.(next)}>{next.title} →</button> : null
                })()}
              </div>
            </div>
          </div>
        )}
        <div className="detail-source">
          {game.sourceUrl
            ? <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">▶ {game.source} ↗</a>
            : game.source}
        </div>
      </div>
    </div>
  )
}

// ============ GAME MODAL ============
function GameModal({ game, categoryMeta, onClose, onNavigate }: { game: Game; categoryMeta: CategoryMetaMap; onClose: () => void; onNavigate?: (g: Game) => void }) {
  const cat = categoryMeta[game.category] || categoryMeta['submissions']
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ '--cat-color': cat.color } as React.CSSProperties}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="gm-title-bar">
          <span style={{ fontSize: 36 }}>{cat.emoji || '🎲'}</span>
          <div>
            <h2 className="gm-title">{game.title}</h2>
            <div className="gm-title-meta"><span>{cat.label}</span><span className="gm-dot">·</span><span>{LEVEL_META[game.level]?.label}</span><span className="gm-dot">·</span><span>{TYPE_META[game.type]?.label}</span></div>
            {game.skills?.length > 0 && (
              <div className="detail-skills" style={{ marginTop: 6 }}>
                {game.skills.map(s => (
                  <span key={s} className="skill-tag" style={{ '--skill-color': SKILL_META[s]?.color } as React.CSSProperties}>
                    {SKILL_META[s]?.icon} {SKILL_META[s]?.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="gm-body">
          <div className="gm-section"><div className="gm-section-label">📍 Starting Position</div><div className="gm-start">{game.startingPosition}</div></div>
          <div className="gm-section"><div className="gm-section-label">⚔️ Players</div>
            <div className="gm-players-grid">
              {game.players.map((p: any, i: number) => (
                <div key={i} className={`gm-player-panel ${i === 0 ? 'gm-player-attacker' : 'gm-player-defender'}`}>
                  <div className="gm-player-role">{p.role}</div>
                  {p.objective && <div className="gm-player-field"><div className="gm-field-label">Task focus</div><div className="gm-field-text">{p.objective}</div></div>}
                  {p.winCondition && <div className="gm-player-field"><div className="gm-field-label gm-field-win">🏆 Win</div><div className="gm-field-text gm-field-win-text">{p.winCondition}</div></div>}
                  {p.constraints?.length > 0 && <div className="gm-player-field"><div className="gm-field-label">⚠️ Constraints</div><ul className="gm-field-list">{p.constraints.map((c: string, ci: number) => <li key={ci}>{c}</li>)}</ul></div>}
                </div>
              ))}
            </div>
          </div>
          {game.designRationale && <div className="gm-section"><div className="gm-section-label">💡 Rationale</div><div className="gm-rationale-box">{game.designRationale}</div></div>}
          {game.progression && (
            <div className="gm-section"><div className="gm-section-label">🔗 Progression — Step {game.progression.step} of {game.progression.totalSteps}</div>
              <div className="detail-progression">
                <div className="prog-dots">
                  {Array.from({ length: game.progression.totalSteps }, (_, i) => (
                    <span key={i} className={`prog-dot ${i + 1 === game.progression!.step ? 'current' : i + 1 < game.progression!.step ? 'done' : ''}`} />
                  ))}
                </div>
                <div className="prog-nav">
                  {game.progression.prevId && (() => {
                    const prev = GAMES.find(g => g.id === game.progression!.prevId)
                    return prev ? <button className="prog-link prog-link-btn" onClick={() => onNavigate?.(prev)}>← {prev.title}</button> : null
                  })()}
                  {game.progression.nextId && (() => {
                    const next = GAMES.find(g => g.id === game.progression!.nextId)
                    return next ? <button className="prog-link prog-link-btn prog-link-next" onClick={() => onNavigate?.(next)}>{next.title} →</button> : null
                  })()}
                </div>
              </div>
            </div>
          )}
          <div className="gm-source">
            {game.sourceUrl
              ? <>Source: <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">▶ {game.source} ↗</a></>
              : `Source: ${game.source}`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ LIBRARY ============
function LibraryPage({ isAdmin, onSelect, customGames, deletedSeedGameIds, categoryMeta, refreshSharedGames, onDeleteGame }: { isAdmin: boolean; onSelect: (g: Game) => void; customGames: Game[]; deletedSeedGameIds: string[]; categoryMeta: CategoryMetaMap; refreshSharedGames: () => Promise<void>; onDeleteGame: (id: string) => Promise<void> }) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [subcategory, setSubcategory] = useState('all')
  const [level, setLevel] = useState('all')
  const [type, setType] = useState('all')
  const [skillFilter, setSkillFilter] = useState<string>('all')
  const [sort, setSort] = useState<LibrarySort>('recommended')
  const [focused, setFocused] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [liveDrafts, setLiveDrafts] = useState<GameDraftSummary[]>([])
  const [activeDraft, setActiveDraft] = useState<GameDraft | null>(null)
  const [liveDraftError, setLiveDraftError] = useState('')
  const liveDraftRequestIdRef = useRef(0)
  const liveDraftRefreshRequestIdRef = useRef(0)
  const liveDraftRefreshMountedRef = useRef(false)
  const customIds = new Set(customGames.map(g => g.id))
  const lastFocusedTrigger = useRef<HTMLElement | null>(null)
  const categoryLabels = useMemo(() => Object.fromEntries(Object.entries(categoryMeta).map(([key, meta]) => [key, meta.label])), [categoryMeta])

  const detailShellRef = useRef<HTMLDivElement>(null)
  const allGames = useMemo(() => [...GAMES.filter(game => !deletedSeedGameIds.includes(game.id)), ...customGames], [customGames, deletedSeedGameIds])
  const categoryCounts = useMemo(() => countGamesByCategory(allGames), [allGames])

  const categoriesPresent = useMemo(() => {
    const s = new Set(allGames.map(g => g.category))
    return Object.entries(categoryMeta).filter(([k]) => s.has(k))
  }, [allGames, categoryMeta])

  const subcategories = useMemo(() => Array.from(new Set(
    allGames
      .filter(game => activeTab === 'all' || game.category === activeTab)
      .map(game => game.subcategory?.trim())
      .filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b)), [allGames, activeTab])

  const filtered = useMemo(() => filterGames(allGames, {
    category: activeTab,
    level,
    type,
    skill: skillFilter,
    query: search,
    categoryLabels,
  }).filter(game => subcategory === 'all' || game.subcategory?.trim() === subcategory), [allGames, activeTab, subcategory, level, type, skillFilter, search, categoryLabels])
  const sortedGames = useMemo(() => sortGames(filtered, sort, categoryLabels), [filtered, sort, categoryLabels])

  const focusedGame = useMemo(() => {
    if (!focused) return null
    return allGames.find(g => g.id === focused) || null
  }, [allGames, focused])


  const openFocusedGame = (gameId: string, trigger: HTMLElement) => {
    lastFocusedTrigger.current = trigger
    setFocused(gameId)
  }

  const closeFocusedGame = () => {
    const trigger = lastFocusedTrigger.current
    lastFocusedTrigger.current = null
    setFocused(null)
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus()
      } else {
        document.querySelector<HTMLElement>('.atlas-search input')?.focus()
      }
    })
  }

  const closeActiveDraft = () => {
    liveDraftRequestIdRef.current += 1
    setActiveDraft(null)
  }

  const refreshLiveDrafts = useCallback(async () => {
    if (!isAdmin || !liveDraftRefreshMountedRef.current) return
    const requestId = ++liveDraftRefreshRequestIdRef.current
    try {
      const drafts = await fetchGameDrafts()
      if (!isAdmin || !liveDraftRefreshMountedRef.current || requestId !== liveDraftRefreshRequestIdRef.current) return
      setLiveDrafts(drafts)
      setLiveDraftError('')
    } catch (error) {
      if (!isAdmin || !liveDraftRefreshMountedRef.current || requestId !== liveDraftRefreshRequestIdRef.current) return
      setLiveDraftError(error instanceof Error ? error.message : 'Unable to load live drafts.')
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) {
      liveDraftRefreshMountedRef.current = false
      liveDraftRefreshRequestIdRef.current += 1
      setLiveDrafts([])
      closeActiveDraft()
      return
    }
    liveDraftRefreshMountedRef.current = true
    void refreshLiveDrafts()
    const interval = window.setInterval(() => { void refreshLiveDrafts() }, 1000)
    return () => {
      liveDraftRefreshMountedRef.current = false
      liveDraftRefreshRequestIdRef.current += 1
      window.clearInterval(interval)
    }
  }, [isAdmin, refreshLiveDrafts])

  const openNewDraft = async () => {
    const requestId = ++liveDraftRequestIdRef.current
    setLiveDraftError('')
    try {
      const draft = await createGameDraft(createBlankGameDraft(`draft-${crypto.randomUUID()}`))
      if (requestId !== liveDraftRequestIdRef.current) return
      setActiveDraft(draft)
      await refreshLiveDrafts()
    } catch (error) {
      if (requestId !== liveDraftRequestIdRef.current) return
      setLiveDraftError(error instanceof Error ? error.message : 'Unable to open a new live draft.')
    }
  }

  const openEditDraft = async (game: Game) => {
    const requestId = ++liveDraftRequestIdRef.current
    setLiveDraftError('')
    try {
      const isCustom = customIds.has(game.id)
      const draftGame = isCustom ? game : { ...game, id: `custom-${crypto.randomUUID()}` }
      const draft = await createGameDraft(createGameDraftFromGame(
        `draft-${crypto.randomUUID()}`,
        draftGame,
        isCustom ? 'replace' : 'create',
        game.id,
      ))
      if (requestId !== liveDraftRequestIdRef.current) return
      setActiveDraft(draft)
      await refreshLiveDrafts()
    } catch (error) {
      if (requestId !== liveDraftRequestIdRef.current) return
      setLiveDraftError(error instanceof Error ? error.message : 'Unable to open this live draft.')
    }
  }

  const openExistingDraft = async (id: string) => {
    const requestId = ++liveDraftRequestIdRef.current
    setLiveDraftError('')
    try {
      const draft = await fetchGameDraft(id)
      if (requestId !== liveDraftRequestIdRef.current) return
      setActiveDraft(draft)
    } catch (error) {
      if (requestId !== liveDraftRequestIdRef.current) return
      setLiveDraftError(error instanceof Error ? error.message : 'Unable to open this live draft.')
    }
  }

  const editFocusedGame = () => {
    if (!focusedGame) return
    const game = focusedGame
    setFocused(null)
    void openEditDraft(game)
  }

  const deleteFocusedGame = async () => {
    if (!focusedGame) return
    if (!window.confirm(`Delete “${focusedGame.title}”? This cannot be undone.`)) return

    setLiveDraftError('')
    try {
      await onDeleteGame(focusedGame.id)
      closeFocusedGame()
    } catch (error) {
      setLiveDraftError(error instanceof Error ? error.message : 'Unable to delete this game.')
    }
  }

  const handleDraftTerminal = async (state: 'published' | 'discarded', game: Game | null) => {
    closeActiveDraft()
    if (state === 'published') {
      await refreshSharedGames()
    }
    await refreshLiveDrafts()
    if (game) setFocused(game.id)
  }

  useEffect(() => {
    if (!focusedGame) return

    const shell = detailShellRef.current
    if (!shell) return

    const previousOverflow = document.body.style.overflow
    const getFocusableElements = () => Array.from(shell.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0)
    const focusFrame = window.requestAnimationFrame(() => {
      (shell.querySelector<HTMLElement>('.detail-close-btn') ?? shell).focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeFocusedGame()
        return
      }
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) {
        event.preventDefault()
        shell.focus()
        return
      }

      const activeElement = document.activeElement
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && (activeElement === firstElement || !shell.contains(activeElement))) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (activeElement === lastElement || !shell.contains(activeElement))) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [focusedGame])
  const clearFilters = () => {
    setActiveTab('all')
    setSubcategory('all')
    setLevel('all')
    setType('all')
    setSkillFilter('all')
    setSearch('')
  }
  const hasActiveFilters = search !== '' || activeTab !== 'all' || subcategory !== 'all' || level !== 'all' || type !== 'all' || skillFilter !== 'all'
  const chooseCategory = (category: string) => {
    setActiveTab(category)
    setSubcategory('all')
  }

  return (<>
    <div className="atlas-page">
      <header className="atlas-hero">
        <span className="atlas-eyebrow">The training game library</span>
        <h1>Find the right problem for today&apos;s round.</h1>
      </header>
      <div className="atlas-toolbar">
        <label className="atlas-search">
          <span>Search games</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Position, task focus, skill, or game name" />
        </label>
        <button className="atlas-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="atlas-filter-panel" onClick={() => setFiltersOpen(open => !open)}>Filters</button>
        {isAdmin && <button className="atlas-create" type="button" onClick={() => void openNewDraft()}>Create game</button>}
      </div>
      <div className="atlas-categories">
        <button type="button" aria-pressed={activeTab === 'all'} onClick={() => chooseCategory('all')}>All <b>{categoryCounts.all}</b></button>
        {categoriesPresent.map(([key, meta]) => (
          <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => chooseCategory(key)} style={{ '--atlas-accent': meta.color } as React.CSSProperties}>
            {meta.label} <b>{categoryCounts[key]}</b>
          </button>
        ))}
      </div>
      {filtersOpen && (
        <div className="atlas-filter-panel" id="atlas-filter-panel">
          <label>Level <select value={level} onChange={event => setLevel(event.target.value)}>
            <option value="all">All levels</option>
            {Object.entries(LEVEL_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select></label>
          <label>Game type <select value={type} onChange={event => setType(event.target.value)}>
            <option value="all">All game types</option>
            {Object.entries(TYPE_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select></label>
          <label>Skill <select value={skillFilter} onChange={event => setSkillFilter(event.target.value)}>
            <option value="all">All skills</option>
            {SKILL_ORDER.map(skill => <option key={skill} value={skill}>{SKILL_META[skill].label}</option>)}
          </select></label>
          <label>Subcategory <select value={subcategory} onChange={event => setSubcategory(event.target.value)} disabled={subcategories.length === 0}>
            <option value="all">All subcategories</option>
            {subcategories.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
        </div>
      )}
      <div className="atlas-active-filters">
        {search !== '' && <button type="button" aria-label={`Clear search: ${search}`} onClick={() => setSearch('')}>Search: “{search}” <span aria-hidden="true">×</span></button>}
        {activeTab !== 'all' && <button type="button" aria-label={`Clear category: ${categoryMeta[activeTab]?.label}`} onClick={() => chooseCategory('all')}>{categoryMeta[activeTab]?.label} <span aria-hidden="true">×</span></button>}
        {subcategory !== 'all' && <button type="button" aria-label={`Clear subcategory: ${subcategory}`} onClick={() => setSubcategory('all')}>{subcategory} <span aria-hidden="true">×</span></button>}
        {level !== 'all' && <button type="button" aria-label={`Clear level: ${LEVEL_META[level]?.label}`} onClick={() => setLevel('all')}>{LEVEL_META[level]?.label} <span aria-hidden="true">×</span></button>}
        {type !== 'all' && <button type="button" aria-label={`Clear game type: ${TYPE_META[type]?.label}`} onClick={() => setType('all')}>{TYPE_META[type]?.label} <span aria-hidden="true">×</span></button>}
        {skillFilter !== 'all' && <button type="button" aria-label={`Clear skill: ${SKILL_META[skillFilter as Skill]?.label}`} onClick={() => setSkillFilter('all')}>{SKILL_META[skillFilter as Skill]?.label} <span aria-hidden="true">×</span></button>}
        {hasActiveFilters && <button className="atlas-clear-all" type="button" onClick={clearFilters}>Clear all</button>}
      </div>
      {isAdmin && (
        <section className="live-drafts" aria-labelledby="live-drafts-title">
          <div className="live-drafts-heading">
            <div>
              <span className="live-drafts-kicker">Collaborative workbench</span>
              <h2 id="live-drafts-title">Live drafts</h2>
            </div>
            <span className="live-draft-status"><span className="live-draft-status-dot" aria-hidden="true" />Live updates</span>
          </div>
          {liveDraftError && (
            <div className="live-drafts-error" role="alert">
              <span>{liveDraftError}</span>
              <button className="live-draft-action" type="button" onClick={() => void refreshLiveDrafts()}>Try again</button>
            </div>
          )}
          {liveDrafts.length > 0 ? (
            <div className="live-drafts-list">
              {liveDrafts.map(draft => (
                <div className="live-draft-row" key={draft.id}>
                  <div className="live-draft-copy">
                    <strong>{draft.title.trim() || 'Untitled game'}</strong>
                    <span>Active draft</span>
                  </div>
                  <button className="live-draft-action" type="button" onClick={() => void openExistingDraft(draft.id)}>Open draft</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="live-drafts-empty">No active drafts.</p>
          )}
        </section>
      )}
      {sortedGames[0] && <AtlasFeaturedGame game={sortedGames[0]} categoryMeta={categoryMeta} onOpen={event => openFocusedGame(sortedGames[0].id, event.currentTarget)} />}
      <div className="atlas-results-head">
        <div className="atlas-results-copy">
          <strong>Browse the library</strong>
          <span>{sortedGames.length} matching {sortedGames.length === 1 ? 'game' : 'games'}</span>
        </div>
        <label className="atlas-sort">
          <span>Sort games</span>
          <select value={sort} onChange={event => setSort(event.target.value as LibrarySort)}>
            <option value="recommended">Recommended</option>
            <option value="title">Title A–Z</option>
            <option value="category">Category</option>
          </select>
        </label>
      </div>
      <div className="atlas-grid">
        {sortedGames.map(game => (
          <AtlasGameCard
            key={game.id}
            game={game}
            custom={customIds.has(game.id)}
            categoryMeta={categoryMeta}
            onOpen={event => openFocusedGame(game.id, event.currentTarget)}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="atlas-empty">
          <strong>No games match these filters.</strong>
          <button type="button" onClick={clearFilters}>Reset filters</button>
          {isAdmin && <button type="button" onClick={() => void openNewDraft()}>Create game</button>}
        </div>
      )}
    </div>
    {focusedGame && (
      <div className="atlas-detail-overlay" role="dialog" aria-modal="true" aria-label={focusedGame.title}>
        <div className="atlas-detail-shell" ref={detailShellRef} tabIndex={-1}>
          <GameDetailInline
            game={focusedGame}
            categoryMeta={categoryMeta}
            onClose={closeFocusedGame}
            onEdit={isAdmin ? editFocusedGame : undefined}
            onDelete={isAdmin ? () => { void deleteFocusedGame() } : undefined}
            onNavigate={game => setFocused(game.id)}
          />
        </div>
      </div>
    )}
    {activeDraft && <GameForm key={activeDraft.id} draft={activeDraft} categoryMeta={categoryMeta} onTerminal={handleDraftTerminal} onClose={closeActiveDraft} />}
  </>)
}

// ============ BUILDER ============
function SortableSessionSlot({ slot, index, game, categoryMeta, onDurationChange, onRemove }: { slot: SessionGame; index: number; game: Game; categoryMeta: CategoryMetaMap; onDurationChange: (duration: number) => void; onRemove: () => void }) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.gameId })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`session-slot${isDragging ? ' is-dragging' : ''}`}>
      <button ref={setActivatorNodeRef} type="button" className="session-slot-drag-handle" aria-label={`Drag ${game.title} to reorder`} title="Drag to reorder" {...attributes} {...listeners}>
        <span className="session-slot-drag-dots" aria-hidden="true"><span /><span /><span /><span /><span /><span /></span>
      </button>
      <div className="session-slot-num">{index + 1}</div>
      <div className="session-slot-info">
        <div className="session-slot-title">{game.title}</div>
        <div className="session-slot-cat">{categoryMeta[game.category]?.label}</div>
      </div>
      <div className="session-slot-duration">
        <input type="number" value={slot.duration} onChange={event => onDurationChange(parseInt(event.target.value) || 0)} min={1} max={30} /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>min</span>
      </div>
      <button type="button" className="session-slot-remove" aria-label={`Remove ${game.title}`} onClick={onRemove}>✕</button>
    </div>
  )
}

function BuilderPage({ draft, games, categoryMeta, isAdmin, onPublished, onDiscarded, onClose, onRefreshGames, onSelect }: { draft: SessionDraft; games: Game[]; categoryMeta: CategoryMetaMap; isAdmin: boolean; onPublished: (session: SessionPlan) => void; onDiscarded: () => void; onClose: () => void; onRefreshGames: () => Promise<void>; onSelect: (g: Game) => void }) {
  const liveDraft = useLiveSessionDraft(draft, onPublished)
  const { session } = liveDraft.draft
  const { title, focus, notes, games: slots } = session
  const levelB = session.level === 'all-levels' ? 'all-levels' : 'beginner'
  const terminalHandledRef = useRef(false)
  const slotsRef = useRef(slots)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [sidebarCategory, setSidebarCategory] = useState('all')
  const [sidebarSubcategory, setSidebarSubcategory] = useState('all')
  const [sidebarLevel, setSidebarLevel] = useState('all')
  const [sidebarType, setSidebarType] = useState('all')
  const [hoveredGame, setHoveredGame] = useState<Game | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const [isSavingSession, setIsSavingSession] = useState(false)
  const [saveSessionError, setSaveSessionError] = useState('')
  const [activeDraft, setActiveDraft] = useState<GameDraft | null>(null)
  const [draftError, setDraftError] = useState('')
  const categoryLabels = useMemo(() => Object.fromEntries(Object.entries(categoryMeta).map(([key, meta]) => [key, meta.label])), [categoryMeta])

  useEffect(() => {
    const availableIds = new Set(games.map(game => game.id))
    const remaining = slots.filter(slot => availableIds.has(slot.gameId))
    if (remaining.length !== slots.length) liveDraft.update({ path: 'games', value: remaining })
  }, [games, liveDraft, slots])

  const totalDuration = slots.reduce((s, g) => s + g.duration, 0)

  useEffect(() => {
    if (!liveDraft.terminalState || terminalHandledRef.current) return
    terminalHandledRef.current = true
    onDiscarded()
  }, [liveDraft.terminalState, onDiscarded])

  useEffect(() => { slotsRef.current = slots }, [slots])

  const updateSlots = (next: SessionGame[] | ((current: SessionGame[]) => SessionGame[])) => {
    const value = typeof next === 'function' ? next(slotsRef.current) : next
    liveDraft.update({ path: 'games', value })
  }

  const addGame = (game: Game) => {
    updateSlots(current => current.some(slot => slot.gameId === game.id) ? current : [...current, { gameId: game.id, duration: 6 }])
  }
  const openNewGameDraft = async () => {
    setDraftError('')
    try {
      setActiveDraft(await createGameDraft(createBlankGameDraft(`draft-${crypto.randomUUID()}`)))
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : 'Unable to open a new game draft.')
    }
  }
  const handleDraftTerminal = async (state: 'published' | 'discarded', game: Game | null) => {
    setActiveDraft(null)
    if (state !== 'published' || !game) return
    try {
      await onRefreshGames()
      updateSlots(current => current.some(slot => slot.gameId === game.id) ? current : [...current, { gameId: game.id, duration: 6 }])
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : 'The game was published, but the class builder could not refresh yet.')
    }
  }
  const removeSlot = (idx: number) => updateSlots(current => current.filter((_, i) => i !== idx))
  const updateSlot = (idx: number, field: keyof SessionGame, value: SessionGame[keyof SessionGame]) => updateSlots(current => current.map((slot, i) => i === idx ? { ...slot, [field]: value } : slot))
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const reorderSlot = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    updateSlots(current => {
      const fromIndex = current.findIndex(slot => slot.gameId === active.id)
      const toIndex = current.findIndex(slot => slot.gameId === over.id)
      return reorderSessionGames(current, fromIndex, toIndex)
    })
  }

  const saveSession = async () => {
    if (slots.length === 0) return
    setIsSavingSession(true)
    setSaveSessionError('')
    try {
      const published = await liveDraft.publish()
      if (!published) setSaveSessionError(liveDraft.error?.message || 'Unable to publish the shared session.')
    } catch (error) {
      setSaveSessionError(readableSessionError(error))
    } finally {
      setIsSavingSession(false)
    }
  }

  const builderCategories = useMemo(() => {
    const presentCategories = new Set(games.map(game => game.category))
    return Object.entries(categoryMeta).filter(([key]) => presentCategories.has(key))
  }, [games, categoryMeta])

  const sidebarSubcategories = useMemo(() => Array.from(new Set(
    games
      .filter(game => sidebarCategory === 'all' || game.category === sidebarCategory)
      .map(game => game.subcategory?.trim())
      .filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b)), [games, sidebarCategory])

  const filteredSidebar = useMemo(() => games.filter(g => {
    if (sidebarCategory !== 'all' && g.category !== sidebarCategory) return false
    if (sidebarSubcategory !== 'all' && g.subcategory?.trim() !== sidebarSubcategory) return false
    if (sidebarLevel !== 'all' && g.level !== sidebarLevel) return false
    if (sidebarType !== 'all' && g.type !== sidebarType) return false
    if (!gameMatchesSearch(g, sidebarSearch, categoryLabels[g.category])) return false
    return true
  }), [games, sidebarSearch, sidebarCategory, sidebarSubcategory, sidebarLevel, sidebarType, categoryLabels])

  // Multi-suggestion engine: progression + balance + skill match + role flip
  const suggestions = useMemo(() => {
    if (slots.length === 0) return []
    return getSuggestions(slots.map(s => s.gameId), games)
  }, [games, slots])

  // --- Smart Session Generator ---
  const [genDuration, setGenDuration] = useState(60)
  const [genLevel, setGenLevel] = useState('beginner')
  const [genFocus, setGenFocus] = useState('guard-passing')
  const [genResult, setGenResult] = useState<GeneratedSession | null>(null)

  const [genSeed, setGenSeed] = useState(0)

  const runGenerator = () => {
    const seed = Date.now()
    setGenSeed(seed)
    const result = generateSession(games, { duration: genDuration, level: genLevel, focus: genFocus, seed })
    setGenResult(result)
  }

  const useGeneratedSession = () => {
    if (!genResult) return
    const newSlots = genResult.games.map(g => ({ gameId: g.gameId, duration: g.duration }))
    updateSlots(newSlots)
    liveDraft.update({ path: 'level', value: genLevel })
    liveDraft.update({ path: 'focus', value: categoryMeta[genFocus]?.label || genFocus })
    setGenResult(null)
  }

  const swapGenGame = (index: number) => {
    if (!genResult) return
    const slot = genResult.games[index]
    const cat = games.find(g => g.id === slot.gameId)?.category
    // Find an alternative game from same category, not already used
    const usedIds = new Set(genResult.games.map((g, i) => i !== index ? g.gameId : ''))
    const alt = games.filter(g => g.category === cat && !usedIds.has(g.id) && g.id !== slot.gameId)
    if (alt.length === 0) return
    // Pick a random alternative (deterministic by sorting first)
    const sorted = alt.sort((a, b) => a.id.localeCompare(b.id))
    const replacement = sorted[Math.floor(Math.random() * Math.min(sorted.length, 5))]
    const newGames = [...genResult.games]
    newGames[index] = { ...slot, gameId: replacement.id, reason: `Swapped: ${replacement.title} (${replacement.level})` }
    setGenResult({ ...genResult, games: newGames })
  }

  if (!isAdmin) return <div className="admin-required"><h2>Admin access required</h2><p>Sign in from the upper-right corner to build or change sessions.</p></div>

  return (
    <div className="builder-layout">
      <div className="builder-main">
        <div className="card session-header-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
            <div><p className="sessions-eyebrow">Live session draft</p><h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>Class Builder</h2><p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{liveDraft.status === 'saving' ? 'Saving changes…' : liveDraft.status === 'error' ? 'Sync needs attention' : 'All changes saved'}</p></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => { void liveDraft.close().then(saved => { if (saved) onClose() }) }}>Back to drafts</button>
              <button type="button" className="btn btn-secondary" onClick={() => { if (window.confirm('Discard this live session draft?')) void liveDraft.discard().then(discarded => { if (discarded) onDiscarded() }) }}>Discard</button>
            </div>
          </div>
          {liveDraft.error && <p className="builder-session-error" role="alert">{liveDraft.error.message}</p>}
          <div className="session-form">
            <div className="session-form-field"><label>Title</label><input value={title} onFocus={() => liveDraft.beginField('title')} onBlur={() => liveDraft.endField('title')} onChange={e => liveDraft.update({ path: 'title', value: e.target.value })} placeholder="Session title" /></div>
            <div className="session-form-field"><label>Level</label><select value={levelB} onFocus={() => liveDraft.beginField('level')} onBlur={() => liveDraft.endField('level')} onChange={e => liveDraft.update({ path: 'level', value: e.target.value })}>
              <option value="beginner">Beginner</option><option value="all-levels">All Levels</option>
            </select></div>
            <div className="session-form-field"><label>Focus</label><input value={focus} onFocus={() => liveDraft.beginField('focus')} onBlur={() => liveDraft.endField('focus')} onChange={e => liveDraft.update({ path: 'focus', value: e.target.value })} placeholder="e.g. Guard passing" /></div>
            <div className="session-form-field"><label>Total</label><input value={`${totalDuration} min`} readOnly style={{ color: 'var(--accent)', fontWeight: 600 }} /></div>
            <div className="session-form-field session-form-field-full"><label>Notes</label><textarea value={notes} onFocus={() => liveDraft.beginField('notes')} onBlur={() => liveDraft.endField('notes')} onChange={e => liveDraft.update({ path: 'notes', value: e.target.value })} placeholder="Session notes" /></div>
          </div>
        </div>
        {/* Smart Session Generator */}
        <div className="generator-panel">
          <div className="generator-header">
            <span className="generator-header-icon">✨</span>
            <span className="generator-header-title">Smart Session Generator</span>
          </div>
          <div className="generator-form">
            <div className="gen-field">
              <label>Duration (min)</label>
              <input type="number" value={genDuration} onChange={e => setGenDuration(parseInt(e.target.value) || 60)} min={30} max={120} step={5} />
            </div>
            <div className="gen-field">
              <label>Level</label>
              <select value={genLevel} onChange={e => setGenLevel(e.target.value)}>
                <option value="beginner">Beginner</option>
                <option value="all-levels">All Levels</option>
              </select>
            </div>
            <div className="gen-field">
              <label>Focus</label>
              <select value={genFocus} onChange={e => setGenFocus(e.target.value)}>
                <option value="balanced">⚖️ Balanced (standing + guard + pinning)</option>
                {builderCategories.map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" onClick={runGenerator} style={{ width: '100%', marginTop: 12, justifyContent: 'center', padding: '10px 16px' }}>
            ✨ Generate Session
          </button>
          {genResult && (
            <div className="gen-result">
              <div className="gen-result-header">
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Generated Session</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{genResult.totalDuration} min · {genResult.games.length} games</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={runGenerator} style={{ fontSize: 12, padding: '5px 12px' }}>↻ Regenerate</button>
                  <button className="btn btn-primary" onClick={useGeneratedSession} style={{ fontSize: 12, padding: '5px 12px' }}>Use This →</button>
                </div>
              </div>
              {(['warmup', 'standing', 'guard-passing', 'pinning'] as const).map(phase => {
                const phaseGames = genResult.games.map((g, i) => ({ ...g, _idx: i })).filter(g => g.phase === phase)
                if (phaseGames.length === 0) return null
                const phaseColors: Record<string, string> = { warmup: '#3b82f6', standing: '#f59e0b', 'guard-passing': 'var(--accent)', pinning: '#a855f7' }
                const phaseNames: Record<string, string> = { warmup: '🔵 Warm-up', standing: '🟡 Standing', 'guard-passing': '🟢 Guard Passing', pinning: '🟣 Pinning' }
                return (
                  <div key={phase} className="gen-phase" style={{ borderLeftColor: phaseColors[phase] }}>
                    <div className="gen-phase-label" style={{ color: phaseColors[phase] }}>{phaseNames[phase]}</div>
                    {phaseGames.map(g => {
                      const game = games.find(gg => gg.id === g.gameId)
                      const cat = game ? categoryMeta[game.category] : null
                      return (
                        <div key={g._idx}>
                          <div className="gen-game-row">
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{g.duration}m</span>
                            {cat && <span style={{ fontSize: 13 }}>{cat.emoji}</span>}
                            <span className="gen-game-title" style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game?.title || g.gameId}</span>
                            <button className="gen-swap-btn" onClick={() => swapGenGame(g._idx)}>↔ Swap</button>
                          </div>
                          <div className="gen-game-reason">{g.reason}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {genResult.warnings.length > 0 && (
                <div className="gen-warnings">
                  {genResult.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
              )}
            </div>
          )}
          {!genResult && (
            <div className="gen-empty">Pick duration, level, and focus — then generate a CLA-structured session.</div>
          )}
        </div>
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={reorderSlot}>
          <SortableContext items={slots.map(slot => slot.gameId)} strategy={verticalListSortingStrategy}>
            <div className="session-slots" aria-label="Session game order">
              {slots.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">·</div><h3>No games selected</h3><p>Pick games from the sidebar.</p></div>
              ) : slots.map((slot, idx) => {
                const game = games.find(g => g.id === slot.gameId)
                if (!game) return null
                return <SortableSessionSlot key={slot.gameId} slot={slot} index={idx} game={game} categoryMeta={categoryMeta} onDurationChange={duration => updateSlot(idx, 'duration', duration)} onRemove={() => removeSlot(idx)} />
              })}
            </div>
          </SortableContext>
        </DndContext>
        {slots.length > 0 && (<div className="session-summary">
          <div className="summary-row"><span>Games</span><span>{slots.length}</span></div>
          <div className="summary-row"><span>Duration</span><span>{totalDuration} min</span></div>
          <div className="summary-row"><span>Categories</span><span>{new Set(slots.map(s => games.find(g => g.id === s.gameId)?.category)).size}</span></div>
        </div>)}
        {suggestions.length > 0 && (
          <div className="suggest-panel">
            <div className="suggest-header">
              <span style={{ fontSize: 16 }}>💡</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Suggested Games</span>
            </div>
            <div className="suggest-list">
              {suggestions.map(s => {
                const game = games.find(g => g.id === s.gameId)
                if (!game) return null
                const cat = categoryMeta[game.category] || categoryMeta['submissions']
                const typeMeta: Record<string, { label: string; color: string }> = {
                  progression: { label: '🔗', color: 'var(--accent)' },
                  balance: { label: '⚖️', color: '#3b82f6' },
                  skill: { label: '🎯', color: '#a855f7' },
                  'role-flip': { label: '🔄', color: '#f59e0b' },
                }
                const tm = typeMeta[s.type]
                return (
                  <div key={s.gameId} className="suggest-card">
                    <span className="suggest-type-badge" style={{ '--badge-color': tm.color } as React.CSSProperties}>{tm.label}</span>
                    <div className="suggest-info">
                      <div className="suggest-title">{cat.emoji} {game.title}</div>
                      <div className="suggest-reason">{s.reason}</div>
                    </div>
                    <button className="suggest-add-btn" onClick={() => addGame(game)}>+ Add</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {slots.length > 0 && <button className="btn btn-primary" onClick={() => { void saveSession() }} disabled={isSavingSession} style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: '12px 20px' }}>{isSavingSession ? 'Publishing shared session…' : `Publish session — ${slots.length} games, ${totalDuration} min`}</button>}
        {saveSessionError && <p className="builder-session-error" role="alert">{saveSessionError}</p>}
      </div>
      <aside className="builder-sidebar">
        <div className="builder-sidebar-heading">
          <h3>Add Games</h3>
          <button type="button" className="btn btn-secondary builder-create-game" onClick={() => void openNewGameDraft()}>Create game</button>
        </div>
        {draftError && <p className="builder-draft-error" role="alert">{draftError}</p>}
        <input className="search-input" style={{ marginBottom: 8 }} placeholder="Search all fields…" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
        <label className="builder-category-filter">
          <span>Category</span>
          <select className="builder-category-select" value={sidebarCategory} onChange={e => { setSidebarCategory(e.target.value); setSidebarSubcategory('all') }}>
            <option value="all">All categories</option>
            {builderCategories.map(([key, category]) => (
              <option key={key} value={key}>{category.emoji} {category.label}</option>
            ))}
          </select>
        </label>
        <label className="builder-category-filter">
          <span>Subcategory</span>
          <select className="builder-category-select" value={sidebarSubcategory} onChange={e => setSidebarSubcategory(e.target.value)} disabled={sidebarSubcategories.length === 0}>
            <option value="all">All subcategories</option>
            {sidebarSubcategories.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="builder-filters">
          <select className="builder-select" value={sidebarLevel} onChange={e => setSidebarLevel(e.target.value)}>
            <option value="all">All Levels</option>
            <option value="beginner">Beginner</option>
            <option value="all-levels">All Levels</option>
          </select>
          <select className="builder-select" value={sidebarType} onChange={e => setSidebarType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="continuous">Continuous</option>
            <option value="terminal">Terminal</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        <div className="builder-count">{filteredSidebar.length} games</div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filteredSidebar.map(game => {
            const cat = categoryMeta[game.category] || categoryMeta['submissions']
            return (
              <div key={game.id} className="builder-game-item" style={{ '--cat-color': cat.color } as React.CSSProperties}>
                <div className="builder-game-item-info" onClick={() => onSelect(game)} style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}>
                  <div className="builder-game-title">{game.title}</div>
                  <div className="builder-game-meta">
                    <span className={`mini-badge mini-level-${game.level}`}>{LEVEL_META[game.level]?.label}</span>
                    <span className={`mini-badge mini-type-${game.type}`}>{TYPE_META[game.type]?.label}</span>
                    {game.subcategory && <span className="mini-badge mini-subcategory">{game.subcategory}</span>}
                    {game.progression && <span className="mini-badge mini-prog">🔗 {game.progression.step}/{game.progression.totalSteps}</span>}
                  </div>
                </div>
                <div className="builder-item-actions">
                  <button className="builder-peek-btn"
                    onMouseEnter={(e) => { setHoveredGame(game); setHoverPos({ x: e.clientX, y: e.clientY }) }}
                    onMouseLeave={() => setHoveredGame(null)}>👁</button>
                  <button className="builder-add-btn" onClick={() => addGame(game)}>+ Add</button>
                </div>
              </div>
            )
          })}
        </div>
        {hoveredGame && (
          <div className="builder-hover-preview" style={{ position: 'fixed', left: Math.min(hoverPos.x, window.innerWidth - 340), top: Math.min(hoverPos.y, window.innerHeight - 300), zIndex: 500 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>{hoveredGame.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{hoveredGame.startingPosition}</div>
            {hoveredGame.players?.slice(0, 2).map((p: any, i: number) => (
              <div key={i} style={{ fontSize: 11, marginBottom: 4, color: i === 0 ? 'var(--accent)' : 'var(--orange)' }}>
                <strong>{p.role}</strong>: {p.objective} {p.winCondition && `🎯 ${p.winCondition}`}
              </div>
            ))}
          </div>
        )}
      </aside>
      {activeDraft && <GameForm
        key={activeDraft.id}
        draft={activeDraft}
        categoryMeta={categoryMeta}
        onTerminal={handleDraftTerminal}
        onClose={() => setActiveDraft(null)}
      />}
    </div>
  )
}

// ============ SESSIONS ============
function LegacySessionsPage({ isAdmin, sessions, setSessions, onCopyEdit }: { isAdmin: boolean; sessions: SessionPlan[]; setSessions: (s: SessionPlan[]) => void; onCopyEdit: (s: SessionPlan) => void }) {
  const [activeId, setActiveId] = useState<string>(sessions[0]?.id || '')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!sessions.some(s => s.id === activeId)) {
      setActiveId(sessions[0]?.id || '')
    }
  }, [sessions, activeId])

  useEffect(() => {
    if (!menuOpenId) return
    const close = () => setMenuOpenId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpenId])

  const deleteSession = (id: string) => setSessions(sessions.filter(s => s.id !== id))

  const getGame = (id: string) => GAMES.find(g => g.id === id)

  const active = sessions.find(s => s.id === activeId) || sessions[0]

  if (sessions.length === 0) {
    return (
      <div className="sessions-page">
        <h2 className="sessions-page-title">My Sessions</h2>
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No sessions yet</h3>
          <p>Build a class to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="sessions-page">
      <h2 className="sessions-page-title">My Sessions</h2>
      <div className="session-tabs">
        {sessions.map(s => (
          <button key={s.id} className={`session-tab ${activeId === s.id ? 'active' : ''}`} onClick={() => setActiveId(s.id)}>
            {s.title}
          </button>
        ))}
      </div>
      {active && (
        <div key={active.id} className="card saved-session-card active-session">
          <div className="card-header">
            <div>
              <div className="card-title">{active.title}</div>
              <div className="saved-session-meta"><span>{active.level}</span><span>·</span><span>{active.duration} min</span><span>·</span><span>{active.games.length} games</span></div>
            </div>
            {isAdmin && <div className="session-menu-wrap">
              <button className="session-menu-btn" onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === active.id ? null : active.id) }}>⋮</button>
              {menuOpenId === active.id && <div className="session-menu-dropdown" onClick={e => e.stopPropagation()}>
                <button onClick={() => { onCopyEdit(active); setMenuOpenId(null) }}>Copy & Edit</button>
                <button className="danger" onClick={() => { deleteSession(active.id); setMenuOpenId(null) }}>Delete</button>
              </div>}
            </div>}
          </div>
          {active.focus && <div className="session-focus">{active.focus}</div>}
          <div className="session-games-list">
            {active.games.map((sg, i) => {
              const g = getGame(sg.gameId)
              const cat = g ? CATEGORY_META[g.category] : null
              return (
                <div key={i} className="sg-row">
                  <span className="sg-dur">{sg.duration}m</span>
                  {cat?.emoji && <span>{cat.emoji}</span>}
                  <span>{g?.title || sg.gameId}</span>
                  {sg.notes && <span className="sg-note">— {sg.notes}</span>}
                </div>
              )
            })}
          </div>
          {active.games.map((sg, i) => {
            const g = getGame(sg.gameId)
            if (!g) return null
            return (
              <div key={i} className="session-game-detail">
                <div className="sgd-title">{g.title}</div>
                <div className="sgd-start">{g.startingPosition}</div>
                {g.players?.map((p: any, pi: number) => (
                  <div key={pi} className={`sgd-player ${pi === 0 ? 'sgd-p1' : 'sgd-p2'}`}>
                    <div className="sgd-role">{p.role}</div>
                    <div className="sgd-obj">{p.objective}</div>
                    {p.winCondition && <div className="sgd-win">Win: {p.winCondition}</div>}
                    {p.constraints?.length > 0 && (
                      <div className="sgd-constraints">{p.constraints.map((c: string, ci: number) => <span key={ci} className="sgd-constraint">{c}</span>)}</div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
          {active.notes && <div className="session-notes-box">{active.notes}</div>}
        </div>
      )}
    </div>
  )
}

// ============ GAME FORM ============
function GameForm({ draft, onClose, onTerminal, categoryMeta }: { draft: GameDraft; onClose: () => void; onTerminal: (state: 'published' | 'discarded', game: Game | null) => void | Promise<void>; categoryMeta: CategoryMetaMap }) {
  const [isCreatingCategory, setIsCreatingCategory] = useState(draft.pendingCategory !== null)
  const [categoryError, setCategoryError] = useState('')
  const [formError, setFormError] = useState('')
  const publishedGameRef = useRef<Game | null>(null)
  const terminalHandledRef = useRef(false)
  const isEditingPendingCategoryRef = useRef(false)
  const closeInFlightRef = useRef(false)
  const liveDraft = useLiveGameDraft(draft, game => { publishedGameRef.current = game })
  const requiresWinCondition = liveDraft.draft.game.type === 'terminal'
  const winConditionGuidance = liveDraft.draft.game.type === 'mixed'
    ? 'For Mixed games, enter a Win condition for the terminal player and leave it blank for the player with the continuous goal.'
    : liveDraft.draft.game.type === 'terminal'
      ? 'Terminal games should have a specific Win condition for both players.'
      : 'Continuous games can leave Win condition blank when both players have ongoing goals.'

  useEffect(() => {
    if (!liveDraft.terminalState || terminalHandledRef.current) return
    terminalHandledRef.current = true
    const publishedGame = liveDraft.terminalState === 'published' ? publishedGameRef.current : null
    void onTerminal(liveDraft.terminalState, publishedGame)
  }, [liveDraft.terminalState, onTerminal])

  useEffect(() => {
    if (isEditingPendingCategoryRef.current) return
    setIsCreatingCategory(liveDraft.draft.pendingCategory !== null)
  }, [liveDraft.draft.pendingCategory])

  const updateField = (path: GameDraftPatchPath, value: GameDraftPatch['value']) => {
    liveDraft.update({ path, value })
  }

  const playerPath = (index: number, field: 'objective' | 'winCondition' | 'constraints'): GameDraftPatchPath => {
    return ('players.' + index + '.' + field) as GameDraftPatchPath
  }

  const beginPendingCategoryField = (path: 'pendingCategory.label' | 'pendingCategory.emoji') => {
    isEditingPendingCategoryRef.current = true
    liveDraft.beginField(path)
  }

  const endPendingCategoryField = (path: 'pendingCategory.label' | 'pendingCategory.emoji') => {
    isEditingPendingCategoryRef.current = false
    liveDraft.endField(path)
    if (!liveDraft.draft.pendingCategory) setIsCreatingCategory(false)
  }

  const handleClose = async () => {
    if (closeInFlightRef.current) return
    closeInFlightRef.current = true
    try {
      const drained = await liveDraft.close()
      if (drained) {
        onClose()
        return
      }
    } finally {
      closeInFlightRef.current = false
    }
  }

  const closeFromBackdrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) void handleClose()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!liveDraft.draft.game.title.trim()) return
    setFormError('')
    try {
      if (isCreatingCategory) {
        const label = liveDraft.draft.pendingCategory?.label.trim() || ''
        const emoji = liveDraft.draft.pendingCategory?.emoji.trim() || ''
        if (!label || !emoji) {
          setCategoryError('Add both a category name and an emoji.')
          return
        }
      }
      setCategoryError('')
      await liveDraft.publish()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to publish this game. Try again.')
    }
  }

  const discardDraft = async () => {
    if (!window.confirm('Discard this live draft?')) return
    setFormError('')
    try {
      await liveDraft.discard()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to discard this draft. Try again.')
    }
  }

  return (
    <div className="modal-overlay" onPointerDown={closeFromBackdrop}>
      <div className="modal game-form-modal" role="dialog" aria-modal="true" aria-labelledby="game-form-title" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 id="game-form-title" style={{ fontSize: 18, fontWeight: 700 }}>Live draft</h2>
            <span className="live-draft-mode">{liveDraft.draft.publishMode === 'replace' ? 'Edit game' : 'New game'}</span>
          </div>
          <button className="modal-close live-draft-close" type="button" onClick={() => void handleClose()} style={{ position: 'static' }} aria-label="Close live draft">✕</button>
        </div>
        <div className={`live-draft-status live-draft-form-status ${liveDraft.status}`} role="status" aria-live="polite">
          <span className="live-draft-status-dot" aria-hidden="true" />
          {liveDraft.status === 'saving' ? 'Saving…' : liveDraft.status === 'error' ? 'Unable to save' : 'Saved'}
        </div>
        {liveDraft.status === 'error' && (
          <div className="live-draft-error" role="alert">
            <span>{liveDraft.error?.message || 'Unable to save this live draft.'}</span>
            <button className="live-draft-action" type="button" onClick={() => void liveDraft.retry()}>Retry</button>
          </div>
        )}
        <form onSubmit={submit}>
          <div className="gf-row-2">
            <div className="gf-field"><label htmlFor="game-title">Title</label><input id="game-title" autoFocus value={liveDraft.draft.game.title} onFocus={() => liveDraft.beginField('title')} onBlur={() => liveDraft.endField('title')} onChange={e => updateField('title', e.target.value)} placeholder="Game name" required /></div>
            <div className="gf-field"><label htmlFor="game-category">Category</label><select id="game-category" value={isCreatingCategory ? CATEGORY_CREATE_VALUE : liveDraft.draft.game.category} onFocus={() => liveDraft.beginField('category')} onBlur={() => liveDraft.endField('category')} onChange={e => {
              if (e.target.value === CATEGORY_CREATE_VALUE) {
                setIsCreatingCategory(true)
                setCategoryError('')
                return
              }
              setIsCreatingCategory(false)
              updateField('pendingCategory', null)
              updateField('category', e.target.value)
              setCategoryError('')
            }}>
              {Object.entries(categoryMeta).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
              <option value={CATEGORY_CREATE_VALUE}>＋ Create new category…</option>
            </select></div>
          </div>
          <div className="gf-field"><label htmlFor="game-subcategory">Subcategory (optional)</label><input id="game-subcategory" value={liveDraft.draft.game.subcategory || ''} onFocus={() => liveDraft.beginField('subcategory')} onBlur={() => liveDraft.endField('subcategory')} onChange={e => updateField('subcategory', e.target.value)} placeholder="e.g. Butterfly guard" /></div>
          {isCreatingCategory && <div className="gf-new-category">
            <div className="gf-section-heading">Create new category</div>
            <div className="gf-row-2">
              <div className="gf-field"><label htmlFor="new-category-name">Category name</label><input id="new-category-name" autoFocus value={liveDraft.draft.pendingCategory?.label || ''} onFocus={() => beginPendingCategoryField('pendingCategory.label')} onBlur={() => endPendingCategoryField('pendingCategory.label')} onChange={e => { updateField('pendingCategory.label', e.target.value); setCategoryError('') }} placeholder="e.g. Turtle" required /></div>
              <div className="gf-field"><label htmlFor="new-category-emoji">Emoji</label><input id="new-category-emoji" value={liveDraft.draft.pendingCategory?.emoji || ''} onFocus={() => beginPendingCategoryField('pendingCategory.emoji')} onBlur={() => endPendingCategoryField('pendingCategory.emoji')} onChange={e => { updateField('pendingCategory.emoji', e.target.value); setCategoryError('') }} placeholder="e.g. 🐢" required /></div>
            </div>
            {categoryError && <p className="gf-error" role="alert">{categoryError}</p>}
          </div>}
          <div className="gf-row-3">
            <div className="gf-field"><label htmlFor="game-level">Level</label><select id="game-level" value={liveDraft.draft.game.level} onFocus={() => liveDraft.beginField('level')} onBlur={() => liveDraft.endField('level')} onChange={e => updateField('level', e.target.value)}>
              <option value="beginner">Beginner</option><option value="all-levels">All Levels</option>
            </select></div>
            <div className="gf-field"><label htmlFor="game-type">Type</label><select id="game-type" value={liveDraft.draft.game.type} onFocus={() => liveDraft.beginField('type')} onBlur={() => liveDraft.endField('type')} onChange={e => updateField('type', e.target.value)}>
              <option value="continuous">Continuous</option><option value="terminal">Terminal</option><option value="mixed">Mixed</option>
            </select></div>
            <div className="gf-field"><label htmlFor="game-source">Source</label><input id="game-source" value={liveDraft.draft.game.source} onFocus={() => liveDraft.beginField('source')} onBlur={() => liveDraft.endField('source')} onChange={e => updateField('source', e.target.value)} placeholder="e.g. Seminar" /></div>
          </div>
          <div className="gf-field"><label htmlFor="game-starting-position">Starting Position</label><textarea id="game-starting-position" value={liveDraft.draft.game.startingPosition} onFocus={() => liveDraft.beginField('startingPosition')} onBlur={() => liveDraft.endField('startingPosition')} onChange={e => updateField('startingPosition', e.target.value)} rows={2} /></div>
          <div className="gf-section-heading">Two-player game content</div>
          <p className="gf-help">Every game has two players. Task focus and Constraints are optional for each player. {winConditionGuidance}</p>
          <div className="gf-players">
            {liveDraft.draft.game.players.map((_player, index) => (
              <div className="gf-player-card" key={index}>
                <div className="gf-player-heading">
                  <h3>{liveDraft.draft.game.players[index].role || 'Player ' + (index + 1)}</h3>
                </div>
                <div className="gf-field"><label htmlFor={`gf-task-focus-${index}`}>Task focus</label><textarea id={`gf-task-focus-${index}`} value={liveDraft.draft.game.players[index].objective} onFocus={() => liveDraft.beginField(playerPath(index, 'objective'))} onBlur={() => liveDraft.endField(playerPath(index, 'objective'))} onChange={e => updateField(playerPath(index, 'objective'), e.target.value)} placeholder="What should this player focus on?" rows={3} /></div>
                <div className="gf-field"><label htmlFor={`gf-win-${index}`}>Win condition {requiresWinCondition ? '' : '(optional for continuous goals)'}</label><textarea id={`gf-win-${index}`} value={liveDraft.draft.game.players[index].winCondition} onFocus={() => liveDraft.beginField(playerPath(index, 'winCondition'))} onBlur={() => liveDraft.endField(playerPath(index, 'winCondition'))} onChange={e => updateField(playerPath(index, 'winCondition'), e.target.value)} placeholder={requiresWinCondition ? 'This player wins when …' : 'Leave blank if this player has a continuous goal …'} rows={3} required={requiresWinCondition} /></div>
                <div className="gf-field"><label htmlFor={`gf-player-constraints-${index}`}>Constraints (one per line)</label><textarea id={`gf-player-constraints-${index}`} value={liveDraft.draft.game.players[index].constraints.join('\n')} onFocus={() => liveDraft.beginField(playerPath(index, 'constraints'))} onBlur={() => liveDraft.endField(playerPath(index, 'constraints'))} onChange={e => updateField(playerPath(index, 'constraints'), e.target.value.split('\n').map(constraint => constraint.trim()).filter(Boolean))} placeholder="Rules or limits for this player …" rows={3} /></div>
              </div>
            ))}
          </div>
          <div className="gf-field"><label htmlFor="game-rationale">Design Rationale</label><textarea id="game-rationale" value={liveDraft.draft.game.designRationale || ''} onFocus={() => liveDraft.beginField('designRationale')} onBlur={() => liveDraft.endField('designRationale')} onChange={e => updateField('designRationale', e.target.value)} rows={2} /></div>
          <div className="gf-field"><label htmlFor="game-tags">Tags (comma separated)</label><input id="game-tags" value={liveDraft.draft.game.tags.join(', ')} onFocus={() => liveDraft.beginField('tags')} onBlur={() => liveDraft.endField('tags')} onChange={e => updateField('tags', e.target.value.split(',').map(tag => tag.trim()).filter(Boolean))} /></div>
          {formError && <p className="gf-error" role="alert">{formError}</p>}
          <div className="gf-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void handleClose()}>Close</button>
            <button type="button" className="btn btn-danger" onClick={() => void discardDraft()}>Discard draft</button>
            <button type="submit" className="btn btn-primary">Publish game</button>
          </div>
        </form>
      </div>
    </div>
  )
}
