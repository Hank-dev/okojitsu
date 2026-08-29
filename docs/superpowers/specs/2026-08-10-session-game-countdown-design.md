# Session Game Countdown Timer

## Goal

Give a coach a glanceable countdown while running one saved session game. The timer belongs inside the existing Run session game overlay, so instructions and navigation stay in the same place and the saved session remains unchanged.

## Scope

- Add a simple, large `MM:SS` countdown to the run dialog in `src/SessionsPage.tsx`.
- Seed each timer from the selected `SessionGame.duration` (minutes), without modifying that saved value.
- Open every game **paused**. Provide `Start`, `Pause`, `Reset`, and `+1 min` controls.
- `Reset` restores the current game's saved duration and paused state. `+1 min` adds 60 seconds to the current remaining time; it preserves a running/paused state, while a finished timer becomes `01:00` paused so starting again is deliberate.
- Switching games through Previous/Next or Left/Right resets to the new game's saved duration and paused state. Timer adjustments never carry to another game.
- At zero, clamp at `00:00`, show a visible `Finished` state, and make one best-effort short alarm through Web Audio plus `navigator.vibrate` when available. Audio/vibration failures are non-fatal and must not block the UI.
- Keep the existing game title, coach cue, starting position, player instructions, progress, Previous/Next, Finish session, Exit session, Escape, and arrow-key navigation intact. Reaching zero never auto-advances.

## Timer behavior and accuracy

- Keep timer arithmetic in the pure, directly testable helper `src/sessionTimer.ts`; React owns only view state and lifecycle.
- Derive remaining time from an absolute deadline/elapsed timestamp using `Date.now()` or an equivalent monotonic clock, not from counting interval callbacks. A delayed tab or busy main thread must lose the real elapsed time, not pause the countdown.
- Repaint while running from the derived timestamp, clamp negative values to zero, and format whole seconds as two-digit minutes and seconds (`MM:SS`).
- On pause, capture the wall-clock-derived remainder and stop the repaint loop. Resume from that remainder with a new deadline. Reset and game changes clear any prior completion marker.
- A zero-duration `SessionGame` opens at `00:00` with `Finished` visible but does not fire an alarm until a started countdown crosses zero. Alarm/vibration fires at most once per countdown run; starting a new countdown after Reset or `+1 min` permits one new completion signal.
- On game change or run-overlay close, stop intervals/animation callbacks, cancel pending timer work, and disconnect/close any alarm nodes or contexts created by the timer. No stale callback may update a new game or fire after close.

## Layout

- Design phone-first for a 390 × 844 viewport: place the timer near the top of the existing run content, keep the digits visually dominant, and keep all four controls reachable without hiding the game instructions or footer navigation.
- Use the existing black, acid-green, serif/sans/mono visual system. The countdown should use a high-contrast monospace treatment; status text must also say `Paused`, `Running`, or `Finished` so color is not the only signal.
- At desktop sizes (including 1440 × 1000), keep the timer prominent without widening the dialog or changing the existing two-column player instructions. At mobile sizes, controls may wrap but must not create horizontal overflow.

## Accessibility

- Use a labelled timer region named `Game timer` with a programmatic status. Do not announce every second through a live region; announce state transitions such as Started, Paused, Reset, and Finished politely.
- Use native buttons with accessible names: `Start timer`, `Pause timer`, `Reset timer`, and `Add one minute`. Every control is keyboard reachable, has a visible focus style, and has at least a 44 × 44 px touch target.
- Keep the existing run-dialog semantics, focus behavior, Escape close, and trigger-focus restoration. The timer must not steal focus when the game changes.
- The finished state and controls remain understandable with forced colors and `prefers-reduced-motion`; no flashing animation is required.

## Testing

| Layer | Coverage |
|---|---|
| Unit | Pure timer helper tests for duration-to-seconds conversion, initial paused state, start/pause/resume, reset, `+1 min`, zero clamping, finished transition, alarm-once bookkeeping, zero-duration games, and delayed-clock/deadline accuracy. |
| Integration | Run-dialog checks that opening and changing games use each `SessionGame.duration`, controls do not mutate `SessionPlan`, zero never changes `runGameIndex`, and closing/changing games leaves no active callback or alarm. Mock Web Audio and `navigator.vibrate` to cover both available and unavailable APIs. |
| Responsive/accessibility | Verify at 390 × 844 and 1440 × 1000: no horizontal overflow, instructions/navigation remain visible, labels and focus order are usable, and controls meet 44 px targets. |
| Regression | Run `npm run test:sessions` and `npm run build`; manually exercise the existing Previous/Next, Finish session, Exit session, Escape, and arrow-key flows with the timer present. |

## Acceptance criteria

1. Opening Run session for a game with `SessionGame.duration = 6` displays `06:00` and `Paused`; no countdown starts until Start is pressed.
2. Start and Pause follow the wall clock; a delayed repaint still shows the correct elapsed remainder. Reset restores `06:00` (or the current game's saved duration) and pauses.
3. `+1 min` adds exactly 60 seconds without silently starting a paused/finished timer; a running timer remains running.
4. Previous/Next and Left/Right load the selected game's saved duration, paused, with no remainder carried from the prior game.
5. At zero the display remains `00:00`, `Finished` is visible and announced once, and Web Audio/vibration are attempted at most once for that countdown run without throwing when either API is unavailable.
6. Existing game instructions, progress, navigation, close behavior, and focus restoration remain present and functional; the timer never auto-advances the game or changes saved session data.
7. Closing the overlay or changing games cleans all timer callbacks and alarm resources; reopening starts the selected game at its saved duration paused.
8. The phone-first and desktop layouts pass the responsive/accessibility checks above with no horizontal overflow.

## Out of scope

- A separate timer screen or route.
- Custom sound files, sound selection, volume settings, or persistent audio preferences.
- Persisting timer state in `localStorage` or in `SessionPlan`.
- Automatic game/session advancement when a countdown finishes.
- Background notifications, service workers, or guaranteed alarms while the tab is hidden.

## Files reference

| File | Change |
|---|---|
| `src/SessionsPage.tsx` | Render timer state and controls inside the existing run dialog; reset and clean up on game change/close while preserving current instructions and navigation. |
| `src/sessionTimer.ts` | Add pure wall-clock timer calculations and state transitions so accuracy and edge cases are unit-testable. |
| `src/sessions.css` | Add phone-first timer/status/control styles and responsive rules without changing the existing run-dialog layout contract. |
| `tests/sessions.test.ts` | Add deterministic timer helper and integration-facing regression coverage. |
