import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSessionTimeline, filterSessions, resolveActiveSession } from '../src/sessions.ts'
import {
  addMinute,
  createTimerState,
  durationToSeconds,
  formatRemainingTime,
  getRemainingSeconds,
  markCompletionSignaled,
  pauseTimer,
  resetTimer,
  sampleTimer,
  startTimer,
} from '../src/sessionTimer.ts'
import type { Game, SessionPlan } from '../src/types.ts'

const sessions: SessionPlan[] = [
  {
    id: 'guard-class',
    title: 'Guard Class',
    date: '2026-08-10',
    duration: 60,
    level: 'beginner',
    focus: 'Knee line entries',
    games: [
      { gameId: 'knee-line', duration: 6 },
      { gameId: 'guard-connection', duration: 8 },
    ],
    notes: 'Build reliable guard connections.',
  },
  {
    id: 'standing-class',
    title: 'Standing Class',
    date: '2026-08-11',
    duration: 45,
    level: 'all-levels',
    focus: 'Standing entries',
    games: [{ gameId: 'standing-entry', duration: 10 }],
    notes: 'Seminar note: keep posture tall.',
  },
]

const games: Game[] = [
  {
    id: 'knee-line',
    title: 'Knee Line Recovery',
    category: 'guard',
    source: 'fixture',
    level: 'beginner',
    type: 'continuous',
    startingPosition: 'open guard',
    players: [{ role: 'defender', objective: 'Recover guard', winCondition: 'Clear the knee line', constraints: [] }],
    constraints: [],
    tags: ['guard'],
    skills: ['connection'],
    progression: null,
  },
  {
    id: 'guard-connection',
    title: 'Guard Connection Flow',
    category: 'guard',
    source: 'fixture',
    level: 'beginner',
    type: 'continuous',
    startingPosition: 'seated guard',
    players: [{ role: 'attacker', objective: 'Keep connection', winCondition: 'Maintain control', constraints: [] }],
    constraints: [],
    tags: ['connection'],
    skills: ['connection'],
    progression: null,
  },
  {
    id: 'standing-entry',
    title: 'Rear Connection Entry',
    category: 'standing',
    source: 'fixture',
    level: 'all-levels',
    type: 'terminal',
    startingPosition: 'standing',
    players: [{ role: 'attacker', objective: 'Find the back', winCondition: 'Connect behind the opponent', constraints: [] }],
    constraints: [],
    tags: ['standing'],
    skills: ['connection'],
    progression: null,
  },
]

const guardSession = sessions[0]

test('filters sessions across session and referenced game content', () => {
  assert.deepEqual(filterSessions(sessions, games, 'knee line').map(session => session.id), ['guard-class'])
  assert.deepEqual(filterSessions(sessions, games, 'beginner').map(session => session.id), ['guard-class'])
  assert.deepEqual(filterSessions(sessions, games, 'seminar note').map(session => session.id), ['standing-class'])
  assert.deepEqual(filterSessions(sessions, games, 'rear connection').map(session => session.id), ['standing-class'])
})

test('returns all sessions for a blank normalized query', () => {
  assert.deepEqual(filterSessions(sessions, games, '   ').map(session => session.id), ['guard-class', 'standing-class'])
})

test('builds cumulative start and end minutes without mutating input', () => {
  assert.deepEqual(buildSessionTimeline(guardSession).map(item => [item.startMinute, item.endMinute]), [[0, 6], [6, 14]])
  assert.deepEqual(guardSession.games.map(game => game.duration), [6, 8])
})

test('keeps zero-duration games at the current timeline minute', () => {
  assert.deepEqual(buildSessionTimeline({...guardSession, games: [{gameId: 'a', duration: 0}]}).map(item => [item.startMinute, item.endMinute]), [[0, 0]])
})

test('resolves the active session from the full list and falls back safely', () => {
  assert.equal(resolveActiveSession(sessions, 'standing-class')?.id, 'standing-class')
  assert.equal(resolveActiveSession(sessions, 'missing')?.id, 'guard-class')
  assert.equal(resolveActiveSession([], 'missing'), undefined)
})

test('moves one selected session game one place without mutating the existing list', async () => {
  const helpers = await import('../src/sessions.ts') as typeof import('../src/sessions.ts') & {
    moveSessionGame?: (games: SessionPlan['games'], index: number, direction: -1 | 1) => SessionPlan['games']
  }
  const games = [
    { gameId: 'first', duration: 6 },
    { gameId: 'second', duration: 8 },
    { gameId: 'third', duration: 10 },
  ]

  assert.equal(typeof helpers.moveSessionGame, 'function')
  const moved = helpers.moveSessionGame!(games, 1, -1)

  assert.deepEqual(moved.map(game => game.gameId), ['second', 'first', 'third'])
  assert.deepEqual(games.map(game => game.gameId), ['first', 'second', 'third'])
})

test('reorders a selected session game to a drag destination without mutating the existing list', async () => {
  const helpers = await import('../src/sessions.ts') as typeof import('../src/sessions.ts') & {
    reorderSessionGames?: (games: SessionPlan['games'], fromIndex: number, toIndex: number) => SessionPlan['games']
  }
  const games = [
    { gameId: 'first', duration: 6 },
    { gameId: 'second', duration: 8 },
    { gameId: 'third', duration: 10 },
  ]

  assert.equal(typeof helpers.reorderSessionGames, 'function')
  const reordered = helpers.reorderSessionGames!(games, 2, 0)

  assert.deepEqual(reordered.map(game => game.gameId), ['third', 'first', 'second'])
  assert.deepEqual(games.map(game => game.gameId), ['first', 'second', 'third'])
})

test('converts minutes and formats a clamped MM:SS value', () => {
  assert.equal(durationToSeconds(6), 360)
  assert.equal(durationToSeconds(-1), 0)
  assert.equal(durationToSeconds(Number.NaN), 0)
  assert.equal(formatRemainingTime(125), '02:05')
  assert.equal(formatRemainingTime(-3), '00:00')
})

test('opens paused and derives remainder from the deadline, not repaint count', () => {
  const initial = createTimerState(0.1) // six seconds
  assert.deepEqual(initial, {
    remainingSeconds: 6,
    status: 'paused',
    endAtMs: null,
    hasStarted: false,
    completionSignaled: false,
  })

  const running = startTimer(initial, 1_000)
  assert.equal(running.status, 'running')
  assert.equal(getRemainingSeconds(running.endAtMs!, 2_350), 5)
  assert.equal(sampleTimer(running, 2_350).remainingSeconds, 5)
})

test('pauses from wall-clock remainder and resumes with a new deadline', () => {
  const running = startTimer(createTimerState(0.1), 1_000)
  const paused = pauseTimer(running, 3_500)
  assert.deepEqual({ status: paused.status, remainingSeconds: paused.remainingSeconds, endAtMs: paused.endAtMs }, {
    status: 'paused', remainingSeconds: 4, endAtMs: null,
  })
  const resumed = startTimer(paused, 10_000)
  assert.equal(resumed.endAtMs, 14_000)
  assert.equal(sampleTimer(resumed, 14_001).status, 'finished')
})

test('reset and add-minute preserve the requested state semantics', () => {
  const zero = createTimerState(0)
  assert.equal(zero.status, 'finished')
  assert.equal(zero.completionSignaled, false)
  assert.equal(startTimer(zero, 0).status, 'finished')

  const paused = addMinute(zero, 0)
  assert.deepEqual({ status: paused.status, remainingSeconds: paused.remainingSeconds }, { status: 'paused', remainingSeconds: 60 })
  const running = startTimer(paused, 0)
  const extended = addMinute(running, 1_000)
  assert.equal(extended.status, 'running')
  assert.equal(extended.endAtMs, 120_000)

  const finished = sampleTimer(running, 60_001)
  const restartedDeliberately = addMinute(finished, 60_001)
  assert.deepEqual({ status: restartedDeliberately.status, remainingSeconds: restartedDeliberately.remainingSeconds, completionSignaled: restartedDeliberately.completionSignaled }, {
    status: 'paused', remainingSeconds: 60, completionSignaled: false,
  })
  assert.equal(resetTimer(6).remainingSeconds, 360)
})

test('completion bookkeeping is idempotent and zero does not signal on open', () => {
  const running = startTimer(createTimerState(0.1), 0)
  const finished = sampleTimer(running, 6_001)
  assert.equal(finished.status, 'finished')
  assert.equal(finished.completionSignaled, false)
  const signaled = markCompletionSignaled(finished)
  assert.equal(signaled.completionSignaled, true)
  assert.equal(markCompletionSignaled(signaled).completionSignaled, true)
})
