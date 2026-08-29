import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryMetaMap, Game, PlayerRole, SessionPlan } from './types'
import { LEVEL_META } from './types'
import { getPlayerGoalType } from './library'
import type { LegacySessionParse } from './sharedSessions'
import type { SessionDraftSummary } from './sharedSessionDrafts'
import { buildSessionTimeline, filterSessions, resolveActiveSession } from './sessions'
import { type TimerState, addMinute, createTimerState, formatRemainingTime, markCompletionSignaled, pauseTimer, resetTimer, sampleTimer, startTimer } from './sessionTimer'
import './sessions.css'

type Props = {
  isAdmin: boolean
  sessions: SessionPlan[]
  games: Game[]
  categoryMeta: CategoryMetaMap
  syncStatus: 'loading' | 'ready' | 'error'
  syncError: string
  legacySessionImport: LegacySessionParse
  isPublishingLegacySessions: boolean
  onRetry: () => void
  onPublishLegacySessions: () => void
  onDeleteSession: (id: string) => Promise<void>
  liveSessionDrafts: SessionDraftSummary[]
  sessionDraftError: string
  onStartLiveSessionDraft: () => void
  onOpenLiveSessionDraft: (id: string) => void
  onCopyEdit: (session: SessionPlan) => void
}

const ALARM_PEAK_GAIN = 0.42
const ALARM_DURATION_SECONDS = 2.4
const ALARM_BEEP_DURATION_SECONDS = 0.28
const ALARM_BEEP_STARTS = [0, 0.45, 0.9, 1.35, 1.8]
const ALARM_VIBRATION_PATTERN = [300, 120, 300, 120, 600, 150, 600]

function PlayerTask({ game, player, index }: { game: Game; player: PlayerRole; index: number }) {
  const goalType = getPlayerGoalType(game, index)
  return (
    <section className={`session-player session-player-${index + 1}`}>
      <div className="session-player-heading">
        <span className="session-player-number">Player {index + 1}</span>
        <span className={`session-goal-badge session-goal-${goalType}`}>
          {goalType === 'continuous' ? 'Continuous' : 'Terminal'}
        </span>
      </div>
      {player.role.trim() !== `Player ${index + 1}` && <h4>{player.role}</h4>}
      <div className="session-task-block"><span className="session-detail-label">Task focus</span><p>{player.objective || 'No task focus added.'}</p></div>
      <div className="session-task-block">
        <span className="session-detail-label">{goalType === 'continuous' ? 'Success condition' : 'Win condition'}</span>
        <p>{player.winCondition || (goalType === 'continuous' ? 'Continue with the task focus.' : 'No win condition added.')}</p>
      </div>
      <div className="session-task-block">
        <span className="session-detail-label">Constraints</span>
        {player.constraints.length ? <ul className="session-constraint-list">{player.constraints.map((c, i) => <li key={`${c}-${i}`}>{c}</li>)}</ul> : <p>No additional constraints.</p>}
      </div>
    </section>
  )
}

function SharedSessionNotice({
  isAdmin, syncStatus, syncError, legacySessionImport, isPublishingLegacySessions, onRetry, onPublishLegacySessions,
}: Pick<Props, 'isAdmin' | 'syncStatus' | 'syncError' | 'legacySessionImport' | 'isPublishingLegacySessions' | 'onRetry' | 'onPublishLegacySessions'>) {
  const localCount = legacySessionImport.sessions.length
  const shouldShow = syncStatus !== 'ready' || localCount > 0
  if (!shouldShow) return null

  return (
    <section className={`shared-sessions-notice is-${syncStatus}`} aria-live="polite">
      {syncStatus === 'loading' && <p>Loading the shared session list…</p>}
      {syncStatus === 'error' && <div><strong>Shared sessions are unavailable.</strong><p>{syncError || 'Check your connection and try again.'}</p><button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button></div>}
      {localCount > 0 && <div className="legacy-sessions-import">
        <strong>{localCount} local {localCount === 1 ? 'session is' : 'sessions are'} ready to publish.</strong>
        <p>Publish them once so everyone can use the same classes on every browser.</p>
        {isAdmin ? <button type="button" className="btn btn-primary" disabled={isPublishingLegacySessions} onClick={onPublishLegacySessions}>{isPublishingLegacySessions ? 'Publishing…' : 'Publish local sessions'}</button> : <p>Sign in as admin to publish these sessions.</p>}
        {legacySessionImport.ignoredCount > 0 && <small>{legacySessionImport.ignoredCount} malformed legacy entries will be ignored.</small>}
      </div>}
    </section>
  )
}

function LiveSessionDrafts({ drafts, error, onStart, onOpen }: { drafts: SessionDraftSummary[]; error: string; onStart: () => void; onOpen: (id: string) => void }) {
  return (
    <section className="shared-sessions-notice is-ready" aria-labelledby="live-session-drafts-heading">
      <div className="legacy-sessions-import">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div><p className="sessions-eyebrow">Collaborative planning</p><strong id="live-session-drafts-heading">Live session drafts</strong></div>
          <button type="button" className="btn btn-primary" onClick={onStart}>+ Start shared session</button>
        </div>
        <p>Open the same draft from another signed-in browser to plan together. Changes save automatically.</p>
        {error && <p role="alert">{error}</p>}
        {drafts.length > 0 && <div className="sessions-browser-list" style={{ marginTop: 10 }}>{drafts.map(draft => (
          <button key={draft.id} type="button" className="sessions-browser-item" onClick={() => onOpen(draft.id)}>
            <strong>{draft.title || 'Untitled session'}</strong><span>Live draft · updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.updatedAt))}</span>
          </button>
        ))}</div>}
      </div>
    </section>
  )
}

export default function SessionsPage({ isAdmin, sessions, games, categoryMeta, syncStatus, syncError, legacySessionImport, isPublishingLegacySessions, onRetry, onPublishLegacySessions, onDeleteSession, liveSessionDrafts, sessionDraftError, onStartLiveSessionDraft, onOpenLiveSessionDraft, onCopyEdit }: Props) {
  const [activeId, setActiveId] = useState(sessions[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [expandedGameIndex, setExpandedGameIndex] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [runGameIndex, setRunGameIndex] = useState<number | null>(null)
  const runDialogRef = useRef<HTMLDivElement>(null)
  const runTriggerRef = useRef<HTMLButtonElement>(null)

  const [timer, setTimer] = useState<TimerState>(() => createTimerState(0))
  const [timerAnnouncement, setTimerAnnouncement] = useState('')
  const [timerRunKey, setTimerRunKey] = useState('closed')
  const timerIntervalRef = useRef<number | null>(null)
  const timerGenerationRef = useRef(0)
  const activeTimerRunRef = useRef<{ runKey: string; generation: number } | null>(null)
  const alarmCleanupRef = useRef<(() => void) | null>(null)

  const clearAlarm = useCallback(() => {
    alarmCleanupRef.current?.()
    alarmCleanupRef.current = null
  }, [])

  const clearTimerWork = useCallback((preserveActiveRun = false) => {
    timerGenerationRef.current += 1
    if (preserveActiveRun && activeTimerRunRef.current) {
      activeTimerRunRef.current = {
        ...activeTimerRunRef.current,
        generation: timerGenerationRef.current,
      }
    } else {
      activeTimerRunRef.current = null
    }
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    clearAlarm()
  }, [clearAlarm])

  const visibleSessions = useMemo(() => filterSessions(sessions, games, query), [sessions, games, query])
  const active = resolveActiveSession(sessions, activeId)
  const gameById = useMemo(() => new Map(games.map(game => [game.id, game])), [games])
  const timeline = useMemo(() => active ? buildSessionTimeline(active) : [], [active])
  const runItem = runGameIndex === null ? null : timeline[runGameIndex]
  const runKey = runItem ? `${runItem.gameId}:${runItem.index}:${runItem.duration}` : 'closed'
  const runOverlayOpen = runItem !== null

  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id)
  }, [active, activeId])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  useEffect(() => {
    clearTimerWork()
    const nextRunKey = runItem ? runKey : 'closed'
    setTimerRunKey(nextRunKey)
    if (!runItem) return
    const generation = timerGenerationRef.current
    activeTimerRunRef.current = { runKey, generation }
    setTimer(createTimerState(runItem.duration))
    setTimerAnnouncement('')
    return () => {
      activeTimerRunRef.current = null
      clearTimerWork()
    }
  }, [clearTimerWork, runKey])

  useEffect(() => {
    if (!runItem || timer.status !== 'running') return
    const generation = timerGenerationRef.current
    const interval = window.setInterval(() => {
      if (timerGenerationRef.current !== generation) return
      setTimer(current => sampleTimer(current, Date.now()))
    }, 250)
    timerIntervalRef.current = interval
    return () => {
      window.clearInterval(interval)
      if (timerIntervalRef.current === interval) timerIntervalRef.current = null
    }
  }, [runKey, timer.status])

  const playCompletionSignal = useCallback(() => {
    let audioContext: AudioContext | null = null
    let oscillator: OscillatorNode | null = null
    let gain: GainNode | null = null

    const cleanup = () => {
      try { oscillator?.stop() } catch {}
      try { oscillator?.disconnect() } catch {}
      try { gain?.disconnect() } catch {}
      try {
        if (audioContext) {
          const closeResult = audioContext.close()
          void closeResult.catch(() => {})
        }
      } catch {}
      try { navigator.vibrate?.(0) } catch {}
    }

    try {
      const AudioContextConstructor = window.AudioContext
      if (AudioContextConstructor) {
        try {
          audioContext = new AudioContextConstructor()
          oscillator = audioContext.createOscillator()
          gain = audioContext.createGain()
          const now = audioContext.currentTime
          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(880, now)
          for (const offset of ALARM_BEEP_STARTS) {
            const pulseStart = now + offset
            gain.gain.setValueAtTime(0.0001, pulseStart)
            gain.gain.exponentialRampToValueAtTime(ALARM_PEAK_GAIN, pulseStart + 0.04)
            gain.gain.exponentialRampToValueAtTime(0.0001, pulseStart + ALARM_BEEP_DURATION_SECONDS)
          }
          oscillator.connect(gain)
          gain.connect(audioContext.destination)
          oscillator.start(now)
          oscillator.stop(now + ALARM_DURATION_SECONDS)
          try {
            const resumeResult = audioContext.resume()
            void resumeResult.catch(() => {})
          } catch {}
        } catch {}
      }
    } catch {}

    try { navigator.vibrate?.(ALARM_VIBRATION_PATTERN) } catch {}
    return cleanup
  }, [])

  useEffect(() => {
    const activeRun = activeTimerRunRef.current
    const generation = activeRun?.generation
    if (
      !runItem ||
      runKey === 'closed' ||
      timerRunKey !== runKey ||
      !activeRun ||
      activeRun.runKey !== runKey ||
      generation === undefined ||
      timerGenerationRef.current !== generation ||
      timer.status !== 'finished' ||
      !timer.hasStarted ||
      timer.completionSignaled
    ) return
    alarmCleanupRef.current = playCompletionSignal()
    setTimerAnnouncement('Finished.')
    setTimer(current => {
      const latestRun = activeTimerRunRef.current
      if (
        !latestRun ||
        latestRun.runKey !== runKey ||
        latestRun.generation !== generation ||
        timerGenerationRef.current !== generation
      ) return current
      return markCompletionSignaled(current)
    })
  }, [playCompletionSignal, runItem, runKey, timerRunKey, timer.completionSignaled, timer.hasStarted, timer.status])

  const closeRun = useCallback(() => {
    clearTimerWork()
    setRunGameIndex(null)
    window.setTimeout(() => runTriggerRef.current?.focus(), 0)
  }, [clearTimerWork])

  const changeRunGame = useCallback((nextIndex: number) => {
    if (runGameIndex === null || runGameIndex === nextIndex) return
    clearTimerWork()
    setRunGameIndex(nextIndex)
  }, [clearTimerWork, runGameIndex])

  useEffect(() => {
    if (runOverlayOpen) runDialogRef.current?.focus()
  }, [runOverlayOpen])

  useEffect(() => {
    if (runGameIndex === null) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRun()
      if (event.key === 'ArrowRight') changeRunGame(Math.min(runGameIndex + 1, timeline.length - 1))
      if (event.key === 'ArrowLeft') changeRunGame(Math.max(runGameIndex - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [changeRunGame, closeRun, runGameIndex, timeline.length])

  const selectSession = (session: SessionPlan) => {
    setActiveId(session.id)
    setExpandedGameIndex(0)
    setBrowserOpen(false)
  }

  if (!active) return (
    <div className="sessions-empty-page">
      <p className="sessions-eyebrow">Class workspace</p><h1>My Sessions</h1>
      <SharedSessionNotice
        isAdmin={isAdmin}
        syncStatus={syncStatus}
        syncError={syncError}
        legacySessionImport={legacySessionImport}
        isPublishingLegacySessions={isPublishingLegacySessions}
        onRetry={onRetry}
        onPublishLegacySessions={onPublishLegacySessions}
      />
      {isAdmin && <LiveSessionDrafts drafts={liveSessionDrafts} error={sessionDraftError} onStart={onStartLiveSessionDraft} onOpen={onOpenLiveSessionDraft} />}
      <div className="empty-state"><div className="empty-state-icon" aria-hidden="true">📋</div><h2>{syncStatus === 'loading' ? 'Loading sessions' : syncStatus === 'error' ? 'Could not load sessions' : 'No sessions yet'}</h2><p>{syncStatus === 'loading' ? 'Getting the shared class list.' : syncStatus === 'error' ? 'Try again to reconnect to the shared class list.' : 'Build a class to create the first shared session.'}</p></div>
    </div>
  )

  const runGame = runItem ? gameById.get(runItem.gameId) : undefined

  return (
    <div className="sessions-page">
      <SharedSessionNotice
        isAdmin={isAdmin}
        syncStatus={syncStatus}
        syncError={syncError}
        legacySessionImport={legacySessionImport}
        isPublishingLegacySessions={isPublishingLegacySessions}
        onRetry={onRetry}
        onPublishLegacySessions={onPublishLegacySessions}
      />
      {isAdmin && <LiveSessionDrafts drafts={liveSessionDrafts} error={sessionDraftError} onStart={onStartLiveSessionDraft} onOpen={onOpenLiveSessionDraft} />}
      <button type="button" className="sessions-browser-toggle" aria-expanded={browserOpen} aria-controls="sessions-browser-panel" onClick={() => setBrowserOpen(v => !v)}>
        <span><small>Choose session</small><strong>{active.title}</strong></span><span aria-hidden="true">{browserOpen ? '−' : '+'}</span>
      </button>
      <div className="sessions-workspace">
        <aside id="sessions-browser-panel" className={`sessions-browser ${browserOpen ? 'is-open' : ''}`}>
          <div className="sessions-browser-heading"><p className="sessions-eyebrow">Class workspace</p><h2>My Sessions</h2></div>
          <label className="sessions-search-label" htmlFor="sessions-search">Search saved sessions</label>
          <div className="sessions-search-wrap"><span aria-hidden="true">⌕</span><input id="sessions-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Title, focus, game…" /></div>
          <div className="sessions-result-count" aria-live="polite">{visibleSessions.length} {visibleSessions.length === 1 ? 'session' : 'sessions'}</div>
          {visibleSessions.length ? (
            <div className="sessions-browser-list">{visibleSessions.map(session => (
              <button type="button" key={session.id} className="sessions-browser-item" aria-pressed={active.id === session.id} onClick={() => selectSession(session)}>
                <strong>{session.title}</strong><span>{LEVEL_META[session.level]?.label ?? session.level} · {session.duration} min · {session.games.length} games</span>
              </button>
            ))}</div>
          ) : (
            <div className="sessions-search-empty"><strong>No sessions match</strong><p>Try a title, focus, level, note, or game name.</p><button type="button" onClick={() => setQuery('')}>Clear search</button></div>
          )}
        </aside>

        <main className="session-workspace-main">
          <header className="session-workspace-header">
            <div className="session-title-group">
              <p className="sessions-eyebrow">Selected session</p><h1>{active.title}</h1>
              <div className="session-meta"><span>{LEVEL_META[active.level]?.label ?? active.level}</span><span>{active.duration} min</span><span>{active.games.length} games</span></div>
              {active.focus && <p className="session-workspace-focus">{active.focus}</p>}
            </div>
            <div className="session-header-actions">
              <button ref={runTriggerRef} type="button" className="btn btn-primary session-run-btn" disabled={!timeline.length} onClick={() => setRunGameIndex(0)}>▶ Run session</button>
              {isAdmin && <><button type="button" className="btn btn-secondary session-copy-btn" onClick={() => onCopyEdit(active)}>Copy &amp; edit</button>
                <div className="session-menu-wrap">
                  <button type="button" className="session-menu-btn" aria-label="Session actions" aria-expanded={menuOpen} onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}>•••</button>
                  {menuOpen && <div className="session-menu-dropdown" onClick={e => e.stopPropagation()}><button type="button" className="danger" onClick={() => {
                    if (window.confirm(`Delete “${active.title}”? This cannot be undone.`)) void onDeleteSession(active.id)
                    setMenuOpen(false)
                  }}>Delete session</button></div>}
                </div></>}
            </div>
          </header>

          <section className="session-timeline-section" aria-labelledby="class-timeline-heading">
            <div className="session-section-heading"><div><p className="sessions-eyebrow">Class flow</p><h2 id="class-timeline-heading">Session timeline</h2></div><span>{timeline.length ? `0–${timeline.at(-1)?.endMinute} min` : 'No games'}</span></div>
            {timeline.length ? <div className="session-timeline">{timeline.map(item => {
              const game = gameById.get(item.gameId)
              const category = game ? categoryMeta[game.category] : undefined
              const expanded = expandedGameIndex === item.index
              const detailId = `session-game-detail-${active.id}-${item.index}`
              return (
                <article className={`session-timeline-item ${expanded ? 'is-expanded' : ''}`} key={`${item.gameId}-${item.index}`}>
                  <button type="button" className="session-timeline-trigger" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpandedGameIndex(expanded ? -1 : item.index)}>
                    <span className="session-sequence">{String(item.index + 1).padStart(2, '0')}</span>
                    <span className="session-time-range">{item.startMinute}–{item.endMinute} min</span>
                    <span className="session-timeline-copy"><span className="session-category"><span aria-hidden="true">{category?.emoji ?? '◌'}</span>{category?.label ?? 'Game'}</span><strong>{game?.title ?? item.gameId}</strong>{item.notes && <small>{item.notes}</small>}</span>
                    <span className="session-expand-icon" aria-hidden="true">{expanded ? '−' : '+'}</span>
                  </button>
                  {expanded && <div className="session-game-panel" id={detailId}>
                    {game ? <><div className="session-start-position"><span className="session-detail-label">Starting position</span><p>{game.startingPosition || 'No starting position added.'}</p></div>
                      <div className="session-player-grid">{game.players.slice(0, 2).map((player, i) => <PlayerTask key={i} game={game} player={player} index={i} />)}</div></> : <p>Game details are unavailable.</p>}
                  </div>}
                </article>
              )
            })}</div> : <div className="session-no-games">This session has no games yet.</div>}
          </section>
          {active.notes && <aside className="session-notes"><span className="session-detail-label">Coach notes</span><p>{active.notes}</p></aside>}
        </main>
      </div>

      {runItem && <div className="session-run-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeRun() }}>
        <div ref={runDialogRef} className="session-run-dialog" role="dialog" aria-modal="true" aria-label={`Run session: ${active.title}`} tabIndex={-1}>
          <header className="session-run-header"><div><p className="sessions-eyebrow">Running · {active.title}</p><div className="session-run-progress">Game {runItem.index + 1} of {timeline.length}</div></div><button type="button" className="session-run-exit" onClick={closeRun}>Exit session</button></header>
          <div className="session-run-progressbar" aria-hidden="true"><span style={{ width: `${((runItem.index + 1) / timeline.length) * 100}%` }} /></div>
          <div className="session-run-content">
            <h2>{runGame?.title ?? runItem.gameId}</h2>
            {runItem.notes && <p className="session-run-coach-note">Coach cue: {runItem.notes}</p>}
            {runGame ? <>
              <div className="session-run-start"><span className="session-detail-label">Starting position</span><p>{runGame.startingPosition || 'No starting position added.'}</p></div>
              <div className="session-player-grid session-run-players">{runGame.players.slice(0, 2).map((player, i) => <PlayerTask key={i} game={runGame} player={player} index={i} />)}</div>
              <div className="session-run-time"><span>{runItem.duration} min game</span><span>{runItem.startMinute} min elapsed · {Math.max(0, active.duration - runItem.endMinute)} min remaining</span></div>
              <section className="session-run-timer" aria-label="Game timer">
                <div className="session-run-timer-display">
                  <span className="session-run-timer-digits">{formatRemainingTime(timer.remainingSeconds)}</span>
                  <span className={`session-run-timer-status is-${timer.status}`} role="status" aria-live="polite">
                    {timer.status === 'running' ? 'Running' : timer.status === 'finished' ? 'Finished' : 'Paused'}
                  </span>
                  <span
                    className="session-run-timer-announcement"
                    aria-live="polite"
                    aria-atomic="true"
                    style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
                  >{timerAnnouncement}</span>
                </div>
                <div className="session-run-timer-controls">
                  <button type="button" className="btn btn-primary session-run-timer-toggle" aria-label={timer.status === 'running' ? 'Pause timer' : 'Start timer'} title={timer.status === 'running' ? 'Pause timer' : 'Start timer'} disabled={timer.status === 'finished' || timer.remainingSeconds === 0} onClick={() => {
                    if (timer.status === 'running') {
                      const nextTimer = pauseTimer(timer, Date.now())
                      setTimer(nextTimer)
                      if (nextTimer !== timer) setTimerAnnouncement(`Paused. ${formatRemainingTime(nextTimer.remainingSeconds)} remaining.`)
                      return
                    }
                    const nextTimer = startTimer(timer, Date.now())
                    setTimer(nextTimer)
                    if (nextTimer !== timer) setTimerAnnouncement(`Started. ${formatRemainingTime(nextTimer.remainingSeconds)} remaining.`)
                  }}>{timer.status === 'running' ? '⏸' : '▶'}</button>
                  <button type="button" className="btn btn-secondary session-run-timer-add" aria-label="Add one minute" title="Add one minute" onClick={() => {
                    if (timer.status === 'finished') clearAlarm()
                    const nextTimer = addMinute(timer, Date.now())
                    setTimer(nextTimer)
                    setTimerAnnouncement(`Added one minute. ${formatRemainingTime(nextTimer.remainingSeconds)} remaining.`)
                  }}>+1</button>
                  <button type="button" className="btn btn-secondary session-run-timer-reset" aria-label="Reset timer" title="Reset timer" onClick={() => {
                    clearTimerWork(true)
                    const nextTimer = resetTimer(runItem.duration)
                    setTimer(nextTimer)
                    setTimerAnnouncement(`Reset. ${formatRemainingTime(nextTimer.remainingSeconds)} remaining.`)
                  }}>↻</button>
                </div>
              </section>
            </> : <p>Game details are unavailable.</p>}
          </div>
          <footer className="session-run-controls">
            <button type="button" className="btn btn-secondary" disabled={runItem.index === 0} onClick={() => changeRunGame(Math.max(runItem.index - 1, 0))}>← Previous</button>
            <span>{runItem.startMinute}–{runItem.endMinute} min</span>
            <button type="button" className="btn btn-primary" onClick={() => runItem.index === timeline.length - 1 ? closeRun() : changeRunGame(runItem.index + 1)}>{runItem.index === timeline.length - 1 ? 'Finish session' : 'Next game →'}</button>
          </footer>
        </div>
      </div>}
    </div>
  )
}
