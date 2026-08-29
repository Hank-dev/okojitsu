# Sessions Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the My Sessions tab wall and duplicated document view with a searchable session browser, ordered class timeline, expandable game details, and local run-session presentation mode.

**Architecture:** Extract session search and timeline calculations into pure helpers in `src/sessions.ts`, then move the UI into a focused `src/SessionsPage.tsx` component that receives sessions and the complete game catalogue as props. Keep stored `SessionPlan` data unchanged; all browsing, expansion, and run-mode state remains local to the component.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, existing CSS design tokens, OpenAI Sites.

## Global Constraints

- Preserve `SessionPlan`, localStorage keys, seed sessions, custom games, and existing persistence.
- Preserve Copy & Edit and Delete behavior; add confirmation before deletion.
- Add no dependencies, schema changes, printing, sharing, timers, or persisted run progress.
- Search title, level, focus, notes, and referenced game titles.
- Only one game detail is expanded at a time; the first game opens when the selected session changes.
- Mobile primary controls are at least 44px tall and the page has no horizontal overflow.
- Match the existing black, acid-green, DM Sans, serif, and mono visual system.

---

### Task 1: Session Search and Timeline Helpers

**Files:**
- Create: `src/sessions.ts`
- Create: `tests/sessions.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SessionPlan`, `SessionGame`, and `Game` from `src/types.ts`.
- Produces:
  - `filterSessions(sessions: SessionPlan[], games: Game[], query: string): SessionPlan[]`
  - `buildSessionTimeline(session: SessionPlan): SessionTimelineItem[]`
  - `resolveActiveSession(sessions: SessionPlan[], activeId: string): SessionPlan | undefined`
  - `SessionTimelineItem = SessionGame & { index: number; startMinute: number; endMinute: number }`

- [ ] **Step 1: Write failing helper tests**

Create `tests/sessions.test.ts` with fixtures containing two sessions and three games. Assert:

```ts
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
```

- [ ] **Step 2: Add and run the test script to verify RED**

Add `"test:sessions": "node --experimental-strip-types --test tests/sessions.test.ts"` to `package.json`.

Run: `npm run test:sessions`

Expected: FAIL because `src/sessions.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

Create `src/sessions.ts`. Normalize queries with `trim().toLowerCase()`; build a game map once; include only referenced game titles in each session’s searchable text. Timeline durations use `Math.max(0, Number.isFinite(duration) ? duration : 0)`.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:sessions`

Expected: all helper tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json src/sessions.ts tests/sessions.test.ts
git commit -m "feat: add session browser helpers"
```

---

### Task 2: Searchable Session Browser and Class Timeline

**Files:**
- Create: `src/SessionsPage.tsx`
- Modify: `src/App.tsx:1-20`
- Modify: `src/App.tsx:130-136`
- Remove: inline `SessionsPage` from `src/App.tsx:1303-1411`

**Interfaces:**
- Consumes the Task 1 helpers and:

```ts
type SessionsPageProps = {
  isAdmin: boolean
  sessions: SessionPlan[]
  games: Game[]
  setSessions: (sessions: SessionPlan[]) => void
  onCopyEdit: (session: SessionPlan) => void
}
```

- Produces the complete browse/detail workspace; Task 3 adds run mode without changing props.

- [ ] **Step 1: Wire the extracted component without changing behavior**

Import `SessionsPage` into `App.tsx`, delete the inline component, and render:

```tsx
<SessionsPage
  isAdmin={isAdmin}
  sessions={sessions}
  games={ALL_GAMES}
  setSessions={setSessions}
  onCopyEdit={startEditSession}
/>
```

Run: `npm run build`

Expected: PASS before redesign behavior is added.

- [ ] **Step 2: Implement the browser state and selection contract**

In `SessionsPage.tsx`, add:

```ts
const [activeId, setActiveId] = useState(sessions[0]?.id ?? '')
const [query, setQuery] = useState('')
const [browserOpen, setBrowserOpen] = useState(false)
const [expandedGameIndex, setExpandedGameIndex] = useState(0)
const visibleSessions = useMemo(() => filterSessions(sessions, games, query), [sessions, games, query])
const active = resolveActiveSession(sessions, activeId)
```

Selecting a session sets `activeId`, resets `expandedGameIndex` to `0`, and closes the mobile browser.

- [ ] **Step 3: Build the session browser**

Render a `sessions-workspace` with:

- `aside.sessions-browser` containing “My Sessions”, a labelled search input, result count, Clear search empty action, and session buttons.
- Each session button shows title plus level, duration, and game count.
- Buttons use `aria-pressed={activeId === session.id}`.
- A mobile `button.sessions-browser-toggle` uses `aria-expanded` and announces the selected title.

- [ ] **Step 4: Build the selected-session header and timeline**

Render:

- A semantic `h1` title, metadata row, focus copy, visible “Copy & edit” admin button, and labelled 44px menu button.
- Confirm deletion with the existing browser confirmation dialog before calling `setSessions`.
- A timeline built from `buildSessionTimeline(active)`.
- Each row is a button with sequence number, `startMinute–endMinute min`, category label, title, note, and `aria-expanded`.
- Expanded content has a stable id `session-game-detail-${active.id}-${index}` referenced by `aria-controls`.
- Render starting position and player panels. Use `getPlayerGoalType(game, playerIndex)` to label Continuous or Terminal. Render constraints as a list.
- Render session notes once after the timeline.

- [ ] **Step 5: Verify behavior and existing tests**

Run:

```bash
npm run test:sessions
npm run test:library
npm run test:admin
npm run build
```

Expected: every command passes.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/SessionsPage.tsx
git commit -m "feat: redesign sessions as searchable class timeline"
```

---

### Task 3: Local Run Session Mode

**Files:**
- Modify: `src/SessionsPage.tsx`

**Interfaces:**
- Consumes the selected session, timeline, game map, and `getPlayerGoalType`.
- Produces a local modal presentation mode with no data writes.

- [ ] **Step 1: Add run-mode state and focus refs**

Add:

```ts
const [runGameIndex, setRunGameIndex] = useState<number | null>(null)
const runDialogRef = useRef<HTMLDivElement>(null)
const runTriggerRef = useRef<HTMLButtonElement>(null)
```

Opening sets index `0`; closing sets `null` and restores focus to `runTriggerRef`.

- [ ] **Step 2: Implement keyboard and body-scroll behavior**

While run mode is open:

- Save and set `document.body.style.overflow = 'hidden'`.
- Focus the dialog after render.
- Escape closes.
- ArrowRight advances until the last game.
- ArrowLeft moves back until the first game.
- Cleanup restores overflow and event listeners.

- [ ] **Step 3: Render the run-session dialog**

Use `role="dialog"`, `aria-modal="true"`, and a label containing the session title. Show:

- “Game N of M”.
- Elapsed and remaining minutes from the timeline.
- Game title, duration, starting position, both player tasks, goal types, win conditions, and constraints.
- Previous, Next/Finish, and Exit session controls.
- Disabled Previous on game 1; Finish closes on the last game.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test:sessions
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/SessionsPage.tsx
git commit -m "feat: add run session presentation mode"
```

---

### Task 4: Responsive ØkoJitsu Workspace Styling and Final Verification

**Files:**
- Modify: `src/index.css:1500-1630`
- Modify: `src/index.css:1738-1785`

**Interfaces:**
- Consumes the Task 2 and Task 3 class names.
- Produces final desktop, mobile, focus, hover, reduced-motion, and modal presentation styling.

- [ ] **Step 1: Replace old tab/document styles**

Remove the `.session-tabs`, `.session-tab`, duplicated full-detail, and obsolete saved-session page rules that are no longer rendered. Keep unrelated builder session styles.

- [ ] **Step 2: Style the desktop workspace**

Use:

- `grid-template-columns: minmax(280px, 320px) minmax(0, 1fr)`.
- A quiet rail with sticky positioning below the header and a bounded vertical list.
- A main session panel with restrained borders and one green primary action.
- Timeline rows with real sequence markers connected by a vertical rule.
- Two equal player columns in expanded details.
- Explicit `:hover`, `:focus-visible`, selected, disabled, and menu states.

- [ ] **Step 3: Style mobile behavior**

At the existing mobile breakpoint:

- Collapse to one column.
- Show the 44px “Choose session” toggle.
- Hide the browser panel while collapsed and show it as a bounded vertical list while open.
- Stack header actions and player panels.
- Use at least 15px body text and 44px controls.
- Ensure `max-width: 100%`, `min-width: 0`, and no horizontal overflow.
- Make run mode fill the viewport with safe-area padding and sticky controls.

- [ ] **Step 4: Add reduced-motion and focus safeguards**

Avoid `transition: all`; transition only color, border-color, background-color, opacity, and transform. Under `prefers-reduced-motion: reduce`, remove nonessential transitions.

- [ ] **Step 5: Run automated verification**

Run:

```bash
npm run test:sessions
npm run test:library
npm run test:admin
npm run build
npm run test:sites-build
git diff --check
```

Expected: all tests and build pass; only the existing nonblocking Vite chunk-size warning may remain.

- [ ] **Step 6: Run requested browser verification**

On the built site or local development URL:

- Desktop 1440×900: search, select another session, expand another game, open/advance/exit run mode.
- Mobile 390×844: open session chooser, search, choose, expand, and run.
- Confirm no horizontal overflow, body copy is at least 15px, primary controls are at least 44px, Escape closes run mode, and trigger focus is restored.
- Check browser console errors.

- [ ] **Step 7: Commit**

```bash
git add src/index.css
git commit -m "style: finish responsive sessions workspace"
```

- [ ] **Step 8: Publish**

Push the exact verified commit, package with the Sites helper, save one version, deploy to the existing public project, poll to success, and open the production URL.
