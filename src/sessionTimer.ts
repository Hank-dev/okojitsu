export type TimerStatus = 'paused' | 'running' | 'finished'

export interface TimerState {
  remainingSeconds: number
  status: TimerStatus
  endAtMs: number | null
  hasStarted: boolean
  completionSignaled: boolean
}

export function durationToSeconds(durationMinutes: number): number {
  const minutes = Number.isFinite(durationMinutes) ? durationMinutes : 0
  return Math.max(0, Math.round(minutes * 60))
}

export function formatRemainingTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0')
  const seconds = (safeSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function getRemainingSeconds(endAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endAtMs - nowMs) / 1_000))
}

export function createTimerState(durationMinutes: number): TimerState {
  const remainingSeconds = durationToSeconds(durationMinutes)
  return {
    remainingSeconds,
    status: remainingSeconds === 0 ? 'finished' : 'paused',
    endAtMs: null,
    hasStarted: false,
    completionSignaled: false,
  }
}

export function startTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status === 'running' || state.remainingSeconds <= 0) return state
  return { ...state, status: 'running', endAtMs: nowMs + state.remainingSeconds * 1_000, hasStarted: true }
}

export function sampleTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'running' || state.endAtMs === null) return state
  const remainingSeconds = getRemainingSeconds(state.endAtMs, nowMs)
  return remainingSeconds > 0
    ? { ...state, remainingSeconds }
    : { ...state, remainingSeconds: 0, status: 'finished', endAtMs: null }
}

export function pauseTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'running') return state
  const sampled = sampleTimer(state, nowMs)
  return sampled.status === 'finished' ? sampled : { ...sampled, status: 'paused', endAtMs: null }
}

export function resetTimer(durationMinutes: number): TimerState {
  return createTimerState(durationMinutes)
}

export function addMinute(state: TimerState, nowMs: number): TimerState {
  if (state.status === 'running' && state.endAtMs !== null) {
    const remainingSeconds = getRemainingSeconds(state.endAtMs, nowMs)
    if (remainingSeconds === 0) return { ...createTimerState(1), hasStarted: false }
    return { ...state, remainingSeconds, endAtMs: state.endAtMs + 60_000, completionSignaled: false }
  }
  return {
    ...state,
    remainingSeconds: state.remainingSeconds + 60,
    status: 'paused',
    endAtMs: null,
    hasStarted: state.status === 'finished' ? false : state.hasStarted,
    completionSignaled: false,
  }
}

export function markCompletionSignaled(state: TimerState): TimerState {
  return state.completionSignaled ? state : { ...state, completionSignaled: true }
}
