# Session Game Countdown Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a glanceable, local countdown to the existing Run session game dialog. A game opens at its saved `SessionGame.duration` paused, can be started/paused/reset/extended, and finishes at `00:00` without changing the saved `SessionPlan` or automatically advancing the game.

**Architecture:** Keep all wall-clock arithmetic and edge-case transitions in a pure `src/sessionTimer.ts` module. `SessionsPage.tsx` owns the timer snapshot, repaint lifecycle, run-game reset/navigation, focus/keyboard behavior, and best-effort alarm resources. The dialog keeps its existing game content and navigation; `sessions.css` adds only scoped timer/status/control rules around the existing layout.

**Tech Stack:** React 19, strict TypeScript, Vite 6, CSS custom properties already used by the session workspace, and Node's built-in `node:test` runner. No new dependencies or browser test framework.

## Global Constraints

- Do not change `SessionPlan`, `SessionGame`, seed data, localStorage, or any saved session value. Timer state is local to the run overlay.
- Seed from the selected `runItem.duration` (minutes). Opening, resetting, changing games, closing/reopening, and Previous/Next or Left/Right navigation all produce the new game's saved duration and `Paused` state.
- Use an absolute deadline/elapsed timestamp (`Date.now()` or equivalent) for running arithmetic. A delayed repaint must lose real wall-clock time; interval callback count must never determine the remainder.
- Clamp negative values at zero and format whole seconds as two-digit `MM:SS`; show a non-color status label of `Paused`, `Running`, or `Finished`.
- `+1 min` adds exactly 60 seconds, preserves a running or paused state, and turns a finished timer into `01:00` paused. Reset and `+1 min` clear completion bookkeeping so a later run can signal once.
- A zero-duration game opens `00:00`/`Finished` with no alarm. Alarm/vibration is attempted at most once only after a started countdown reaches zero; missing or throwing Web Audio/vibration APIs are non-fatal.
- Stop repaint callbacks and cancel/close every alarm node/context on game change and overlay close. Guard callbacks against a stale run identity so an old callback cannot update a new game.
- Preserve the existing title, coach cue, starting position, player instructions, progress bar, Previous/Next, Finish session, Exit session, Escape close, arrow-key navigation, dialog semantics, and trigger-focus restoration. Reaching zero never changes `runGameIndex`.
- Keep timer controls native, keyboard reachable, visibly focused, and at least 44 × 44 px. Do not put the per-second digits in a live region; politely announce state transitions only.
- Keep phone-first layout usable at 390 × 844 and desktop layout usable at 1440 × 1000 without widening the dialog, changing its two-column player instructions, or creating horizontal overflow. Honor forced colors and `prefers-reduced-motion`.
- Every implementation task below is an independently reviewable TDD deliverable: write one focused failing test/contract, run it and record the expected failure, make the smallest implementation, rerun to green, then commit only that task's files.

## Exact File Map

| File | Change |
|---|---|
| `src/sessionTimer.ts` | Create pure duration conversion, formatting, deadline sampling, and timer state-transition helpers. |
| `tests/sessions.test.ts` | Extend the existing Node tests with deterministic timer-helper coverage while retaining current session timeline/filter tests. |
| `src/SessionsPage.tsx` | Add local timer state, reset/navigation lifecycle, repaint effect, controls, status announcements, and best-effort Web Audio/vibration cleanup inside the existing run dialog. |
| `src/sessions.css` | Add scoped phone-first timer digits/status/control styles, focus/disabled states, desktop sizing, mobile wrapping, and reduced-motion safeguards. |
| `tests/visualContract.test.mjs` | Add small source/CSS contract assertions for timer labels, API cleanup hooks, 44px targets, responsive wrapping, and reduced motion. |

No `package.json` change is needed: `npm run test:sessions` already runs `tests/sessions.test.ts`; the timer tests stay in that file.

---

## Task 1: Pure wall-clock timer model (TDD)

**Files:**

- Modify: `tests/sessions.test.ts`
- Create: `src/sessionTimer.ts`

**Interfaces:**

```ts
export type TimerStatus = 'paused' | 'running' | 'finished'

export interface TimerState {
  remainingSeconds: number
  status: TimerStatus
  endAtMs: number | null
  hasStarted: boolean
  completionSignaled: boolean
}

export function durationToSeconds(durationMinutes: number): number
export function formatRemainingTime(totalSeconds: number): string
export function getRemainingSeconds(endAtMs: number, nowMs: number): number
export function createTimerState(durationMinutes: number): TimerState
export function startTimer(state: TimerState, nowMs: number): TimerState
export function pauseTimer(state: TimerState, nowMs: number): TimerState
export function sampleTimer(state: TimerState, nowMs: number): TimerState
export function resetTimer(durationMinutes: number): TimerState
export function addMinute(state: TimerState, nowMs: number): TimerState
export function markCompletionSignaled(state: TimerState): TimerState
```

- [ ] **Step 1 (2–5 min): Write failing deterministic helper tests.** Add imports from `../src/sessionTimer.ts` and append focused tests to `tests/sessions.test.ts` for conversion/formatting (`6 → 360`, negatives/non-finite clamp, `125 → 02:05`), initial paused state, start/pause/resume, delayed-clock accuracy, reset, `+1 min`, zero clamping/finished transition, alarm-once bookkeeping, and zero-duration games. Use fixed timestamps, never sleeps or real timers:

```ts
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
```

- [ ] **Step 2 (2–5 min): Run the focused suite to record RED.** Run `npm run test:sessions`. Expected: the existing session tests pass, while the new tests fail to load with an `ERR_MODULE_NOT_FOUND`/missing-export error because `src/sessionTimer.ts` does not exist yet.

- [ ] **Step 3 (2–5 min): Implement the minimal pure helper module.** Create `src/sessionTimer.ts` with no React or browser imports. Use finite-value clamping and ceiling for a displayed running second so elapsed wall-clock time is never hidden:

```ts
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
```

- [ ] **Step 4 (2–5 min): Run the helper suite to record GREEN.** Run `npm run test:sessions`. Expected: the existing filter/timeline tests and every deterministic timer test pass; no saved-session fixture duration changes.

- [ ] **Step 5 (2–5 min): Commit the pure model.** Run `git add src/sessionTimer.ts tests/sessions.test.ts && git commit -m "feat: add wall-clock session timer helpers"`. Confirm the commit contains only those two files.

---

## Task 2: Run-dialog timer state, controls, and lifecycle (TDD)

**Files:**

- Modify: `tests/visualContract.test.mjs`
- Modify: `src/SessionsPage.tsx`

**Interfaces:**

- Import `TimerState`, `addMinute`, `createTimerState`, `formatRemainingTime`, `markCompletionSignaled`, `pauseTimer`, `resetTimer`, `sampleTimer`, and `startTimer` from `./sessionTimer`.
- Keep `SessionsPage` props unchanged. Timer state must never call `setSessions`.
- Derive a stable run identity from `runItem.gameId`, `runItem.index`, and `runItem.duration`; do not use the whole object as an unstable reset key.

- [ ] **Step 1 (2–5 min): Add failing source contracts for timer semantics and accessibility.** In `tests/visualContract.test.mjs`, read `src/SessionsPage.tsx` into `sessionsPage` and add a test that requires a labelled `Game timer` region, the four native control names (`Start timer`, `Pause timer`, `Reset timer`, `Add one minute`), `createTimerState(runItem.duration)`, `Date.now()`, `navigator.vibrate`, an `AudioContext` attempt, a repaint cleanup call (`clearInterval` or `cancelAnimationFrame`), and completion marking. Keep the assertions structural rather than coupling to one JSX layout.

- [ ] **Step 2 (2–5 min): Run the source contract to record RED.** Run `npm run test:visual-contract`. Expected: existing visual-contract tests pass, but the new timer contract fails because `SessionsPage.tsx` has no timer region, controls, helper imports, or alarm/lifecycle code.

- [ ] **Step 3 (2–5 min): Add local timer state and stale-work cleanup.** In `SessionsPage.tsx`, derive `runItem` before the existing `if (!active) return` so all hooks remain unconditional. Add refs and a stable cleanup callback:

```tsx
const [timer, setTimer] = useState<TimerState>(() => createTimerState(0))
const timerIntervalRef = useRef<number | null>(null)
const timerGenerationRef = useRef(0)
const alarmCleanupRef = useRef<(() => void) | null>(null)

const clearAlarm = useCallback(() => {
  alarmCleanupRef.current?.()
  alarmCleanupRef.current = null
}, [])

const clearTimerWork = useCallback(() => {
  timerGenerationRef.current += 1
  if (timerIntervalRef.current !== null) {
    window.clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = null
  }
  clearAlarm()
}, [clearAlarm])

const runKey = runItem ? `${runItem.gameId}:${runItem.index}:${runItem.duration}` : 'closed'

useEffect(() => {
  clearTimerWork()
  if (!runItem) return
  setTimer(createTimerState(runItem.duration))
  return clearTimerWork
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
```

The existing Escape and overlay-close paths must call `clearTimerWork()` before setting `runGameIndex(null)`. Route Previous/Next and ArrowLeft/ArrowRight through a small `changeRunGame(nextIndex)` helper that clears work only when the index actually changes, then updates `runGameIndex`; this preserves arrow boundaries and prevents an old interval from touching the next game.

- [ ] **Step 4 (2–5 min): Implement controls and timer markup without changing run content.** Add a timer section immediately inside `.session-run-content`, before the game title, and keep all existing cue/position/player/footer markup intact:

```tsx
<section className="session-run-timer" aria-label="Game timer">
  <div className="session-run-timer-display">
    <span className="session-run-timer-digits">{formatRemainingTime(timer.remainingSeconds)}</span>
    <span className={`session-run-timer-status is-${timer.status}`} role="status" aria-live="polite">
      {timer.status === 'running' ? 'Running' : timer.status === 'finished' ? 'Finished' : 'Paused'}
    </span>
  </div>
  <div className="session-run-timer-controls">
    <button type="button" className="btn btn-primary" aria-label="Start timer" disabled={timer.status === 'running' || timer.remainingSeconds === 0} onClick={() => setTimer(current => startTimer(current, Date.now()))}>Start</button>
    <button type="button" className="btn btn-secondary" aria-label="Pause timer" disabled={timer.status !== 'running'} onClick={() => setTimer(current => pauseTimer(current, Date.now()))}>Pause</button>
    <button type="button" className="btn btn-secondary" aria-label="Reset timer" onClick={() => { clearTimerWork(); setTimer(resetTimer(runItem.duration)) }}>Reset</button>
    <button type="button" className="btn btn-secondary" aria-label="Add one minute" onClick={() => { if (timer.status === 'finished') clearAlarm(); setTimer(current => addMinute(current, Date.now())) }}>+1 min</button>
  </div>
</section>
```

Use the current status text as the only polite live region; keep the changing digits outside `aria-live` so screen readers do not announce every repaint. If the UI uses one conditional Start/Pause button instead, retain both exact accessible names and the same disabled semantics.

- [ ] **Step 5 (2–5 min): Add the best-effort completion signal and one-shot guard.** Define a local `playCompletionSignal` that catches constructor, oscillator, resume, close, and vibration failures. Create a short oscillator/gain envelope only when `window.AudioContext` exists, call `navigator.vibrate?.([120, 80, 120])` when available, and return cleanup that stops/disconnects nodes, closes the context, and best-effort cancels vibration. Trigger it from an effect only when `timer.status === 'finished'`, `timer.hasStarted`, and `!timer.completionSignaled`, then call `setTimer(current => markCompletionSignaled(current))`. A zero-duration initial state therefore remains silent, and the marker prevents repeat alarms until Reset or `+1 min` clears it.

- [ ] **Step 6 (2–5 min): Run integration-facing contracts and compile.** Run `npm run test:visual-contract && npm run test:sessions && npm run build`. Expected: all source contracts pass, timer helper tests remain green, and strict TypeScript accepts the Web Audio/vibration guards without adding dependencies.

- [ ] **Step 7 (2–5 min): Commit the run-dialog integration.** Run `git add src/SessionsPage.tsx tests/visualContract.test.mjs && git commit -m "feat: add session game countdown controls"`. Confirm the diff does not touch `src/types.ts`, session persistence, or navigation outside the run dialog.

---

## Task 3: Phone-first timer presentation and responsive/accessibility contracts (TDD)

**Files:**

- Modify: `tests/visualContract.test.mjs`
- Modify: `src/sessions.css`

- [ ] **Step 1 (2–5 min): Add failing CSS contracts.** Extend `tests/visualContract.test.mjs` with assertions against `src/sessions.css` for `.session-run-timer`, high-contrast monospace digits, `.session-run-timer-controls` wrapping, a `min-height: 44px` control target, a mobile `@media (max-width: 800px)` rule that avoids overflow, visible `:focus-visible` styling, disabled styling, and an `@media (prefers-reduced-motion: reduce)` override.

- [ ] **Step 2 (2–5 min): Run the CSS contract to record RED.** Run `npm run test:visual-contract`. Expected: the pre-existing contracts pass, while the new timer CSS assertions fail because no timer-specific rules exist yet.

- [ ] **Step 3 (2–5 min): Add scoped desktop timer styles.** Append rules to `src/sessions.css` that keep the existing dialog width and two-column player grid unchanged:

```css
.session-run-timer {
  display: grid;
  gap: 16px;
  min-width: 0;
  margin: 0 0 28px;
  padding: 18px;
  border: 1px solid var(--border-light);
  background: #000;
}
.session-run-timer-display {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}
.session-run-timer-digits {
  color: var(--accent);
  font: 700 clamp(48px, 10vw, 96px)/1 var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.06em;
  white-space: nowrap;
}
.session-run-timer-status {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font: 700 11px var(--font-mono);
  letter-spacing: .08em;
  text-transform: uppercase;
}
.session-run-timer-status.is-running { color: var(--accent); }
.session-run-timer-status.is-finished { color: var(--orange); }
.session-run-timer-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.session-run-timer-controls button {
  min-width: 112px;
  min-height: 44px;
}
.session-run-timer-controls button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.session-run-timer-controls button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
```

- [ ] **Step 4 (2–5 min): Add mobile, forced-color, and reduced-motion safeguards.** Within the existing `@media (max-width: 800px)` block, let the timer display stack safely and let controls wrap to full-width buttons without horizontal overflow; add `@media (forced-colors: active)` borders/status text that remain legible; add `@media (prefers-reduced-motion: reduce)` to remove any timer transitions. Do not add flashing animation or a new breakpoint that changes the run dialog's existing navigation.

- [ ] **Step 5 (2–5 min): Run the responsive contracts and build.** Run `npm run test:visual-contract && npm run build`. Expected: all CSS/source contracts pass and the production TypeScript/Vite build succeeds.

- [ ] **Step 6 (2–5 min): Commit the presentation layer.** Run `git add src/sessions.css tests/visualContract.test.mjs && git commit -m "style: make session timer phone-first"`. Confirm only timer-scoped selectors and their contracts changed.

---

## Task 4: Regression, mocked-alarm, and viewport verification

**Files:**

- No new files; verify the Task 1–3 changes together.

- [ ] **Step 1 (2–5 min): Run the requested automated regression commands.** Run `npm run test:sessions`, `npm run test:visual-contract`, and `npm run build` separately so a failure is attributable. Expected: all tests pass and the build emits only any existing non-blocking Vite chunk-size warning.

- [ ] **Step 2 (2–5 min): Exercise available and unavailable alarm APIs.** In the running app, use a short-duration fixture or temporarily mock `window.AudioContext` and `navigator.vibrate` in DevTools to count calls. Start one timer, let it reach zero, and confirm one audio/vibration attempt plus `Finished`; reset or add a minute and confirm one new attempt is possible. Repeat with both APIs absent/throwing and confirm the UI still reaches `Finished` without an uncaught error. Restore the normal APIs after the check.

- [ ] **Step 3 (2–5 min): Verify the mobile run flow at 390 × 844.** Open Run session, confirm `06:00`/`Paused` (or the selected game's saved duration), start/pause/reset/add a minute, switch with Previous/Next and Left/Right, and close with Exit, overlay click, and Escape. Confirm instructions/footer remain visible, controls are reachable at 44px or larger, no horizontal scrollbar appears, zero never advances the game, and reopening resets paused state.

- [ ] **Step 4 (2–5 min): Verify the desktop run flow at 1440 × 1000.** Confirm the timer remains prominent without widening the dialog or changing the two-column player instructions; exercise title, cue, progress, Previous/Next, Finish session, Escape, and trigger-focus restoration. Confirm `SessionPlan` data remains unchanged after every timer action.

- [ ] **Step 5 (2–5 min): Self-review acceptance coverage and whitespace.** Review the diff against `docs/superpowers/specs/2026-08-10-session-game-countdown-design.md`, check zero-duration silence, deadline accuracy, one-shot bookkeeping, cleanup/generation guards, forced colors/reduced motion, and run `git diff --check`. Resolve any placeholder, stale dependency, or type inconsistency before handing off the implementation plan to the parent agent.
