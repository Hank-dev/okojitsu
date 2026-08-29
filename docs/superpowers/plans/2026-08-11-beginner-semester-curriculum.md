# Beginner Semester Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a compact Curriculum tab containing an 18-week beginner semester of six existing six-minute games per class.

**Architecture:** Keep the course data in a typed data module and render it from a small page component in `App.tsx`. Reuse the existing game library as the single source of truth and test that every curriculum reference resolves to it.

**Tech Stack:** React, TypeScript, Vite, existing Node test suite.

## Global Constraints

- 18 sessions from mid-August to mid-December.
- Exactly six existing games per session; each game is six minutes.
- No new game content, leg-lock submissions, or technique choreography.
- Keep the tab a concise list, with only focus and game names.

---

### Task 1: Define and validate the semester data

**Files:**
- Create: `src/data/beginner-curriculum.ts`
- Create: `tests/beginnerCurriculum.test.ts`

**Interfaces:**
- Produces: `BEGINNER_SEMESTER`, an array of `{ week: number; focus: string; games: { gameId: string; duration: number }[] }` entries.
- Consumes: `src/data/games.json` in the test to resolve IDs.

- [ ] **Step 1: Write the failing test**

```ts
import games from '../src/data/games.json'
import { BEGINNER_SEMESTER } from '../src/data/beginner-curriculum'

test('the beginner semester has 18 six-game sessions using only library games', () => {
  expect(BEGINNER_SEMESTER).toHaveLength(18)
  const gameIds = new Set(games.map(game => game.id))
  for (const session of BEGINNER_SEMESTER) {
    expect(session.games).toHaveLength(6)
    for (const game of session.games) {
      expect(game.duration).toBe(6)
      expect(gameIds.has(game.gameId)).toBe(true)
    }
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/beginnerCurriculum.test.ts`

Expected: FAIL because `src/data/beginner-curriculum.ts` does not exist.

- [ ] **Step 3: Add the typed 18-session data module**

```ts
export type CurriculumGame = { gameId: string; duration: 6 }
export type CurriculumSession = { week: number; focus: string; games: CurriculumGame[] }
const six = (gameId: string): CurriculumGame => ({ gameId, duration: 6 })
export const BEGINNER_SEMESTER: CurriculumSession[] = [
  { week: 1, focus: 'First contact and feet off', games: [six('grip-fighting-more-grips'), six('beginner-feet-off'), six('beginner-inside-position'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows')] },
  { week: 2, focus: 'Inside position and guard recovery', games: [six('scott-frame-game'), six('beginner-feet-off'), six('beginner-inside-position'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('beginner-scalable-pinning')] },
  { week: 3, focus: 'Connection from standing to the floor', games: [six('grip-fighting-more-grips'), six('scott-get-to-back'), six('seated-handfight'), six('beginner-feet-off'), six('beginner-stay-on-top-hold-down'), six('back-control-no-subs')] },
  { week: 4, focus: 'Seated guard and staying in front', games: [six('transcript-connection-warmup'), six('seated-handfight'), six('seated-denying-supine'), six('beginner-feet-off'), six('beginner-cover-the-hips'), six('beginner-get-under-elbows')] },
  { week: 5, focus: 'Get to your feet safely', games: [six('grip-fighting-more-grips'), six('just-stand-up-hand-denial'), six('just-stand-up-one-hand-knee'), six('just-stand-up-turtle-breakdown'), six('beginner-stay-on-top-hold-down'), six('beginner-scalable-pinning')] },
  { week: 6, focus: 'Hold down and recover guard', games: [six('scott-frame-game'), six('beginner-feet-off'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows'), six('beginner-scalable-pinning')] },
  { week: 7, focus: 'Hand fighting and seated connection', games: [six('grip-fighting-more-grips'), six('pj-hand-fighting-inside-position'), six('seated-handfight'), six('seated-upper-stay-connected'), six('seated-destabilising-wrestling-up'), six('beginner-stay-on-top-hold-down')] },
  { week: 8, focus: 'Guard connection and knee line', games: [six('transcript-connection-warmup'), six('fundamentals-make-inside'), six('fundamentals-inside-one-leg'), six('fundamentals-destabilize-knee-line'), six('beginner-cover-the-hips'), six('alllevels-side-control-hip')] },
  { week: 9, focus: 'Reset: feet, frames, and pins', games: [six('scott-frame-game'), six('beginner-feet-off'), six('beginner-inside-position'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows'), six('back-control-no-subs')] },
  { week: 10, focus: 'Stand-up problem and connection', games: [six('grip-fighting-more-grips'), six('just-stand-up-hand-denial'), six('just-stand-up-one-hand-knee'), six('just-stand-up-chest-no-hands'), six('seated-destabilising-wrestling-up'), six('beginner-cover-the-hips')] },
  { week: 11, focus: 'Passing the feet to the hips', games: [six('transcript-connection-warmup'), six('beginner-feet-off'), six('beginner-inside-position'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('alllevels-side-control-hip')] },
  { week: 12, focus: 'Seated guard, wrestle up, and recover', games: [six('scott-get-to-back'), six('seated-denying-supine'), six('seated-destabilising-wrestling-up'), six('seated-handfight'), six('just-stand-up-one-hand-knee'), six('beginner-stay-on-top-hold-down')] },
  { week: 13, focus: 'Pinning: hips, elbows, and escape', games: [six('grip-fighting-more-grips'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows'), six('beginner-scalable-pinning'), six('scaling-completing-pins')] },
  { week: 14, focus: 'Back control without submissions', games: [six('scott-frame-game'), six('scott-get-to-back'), six('just-stand-up-turtle-breakdown'), six('back-control-no-subs'), six('alllevels-allfours-rear'), six('beginner-stay-on-top-hold-down')] },
  { week: 15, focus: 'Guard connection under changing starts', games: [six('transcript-connection-warmup'), six('fundamentals-make-inside'), six('fundamentals-inside-one-leg'), six('seated-denying-supine'), six('beginner-feet-off'), six('beginner-cover-the-hips')] },
  { week: 16, focus: 'Stand, sit, pass, pin', games: [six('grip-fighting-more-grips'), six('scott-get-to-back'), six('seated-handfight'), six('beginner-inside-position'), six('beginner-get-under-elbows'), six('back-control-no-subs')] },
  { week: 17, focus: 'Review: pick up old problems', games: [six('scott-frame-game'), six('just-stand-up-chest-free-grip'), six('seated-destabilising-wrestling-up'), six('beginner-cover-the-hips'), six('beginner-scalable-pinning'), six('scaling-completing-pins')] },
  { week: 18, focus: 'Semester integration', games: [six('grip-fighting-more-grips'), six('fundamentals-make-inside'), six('beginner-feet-off'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows'), six('back-control-no-subs')] },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/beginnerCurriculum.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/beginner-curriculum.ts tests/beginnerCurriculum.test.ts
git commit -m "feat: add beginner semester curriculum data"
```

### Task 2: Render the Curriculum tab

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `BEGINNER_SEMESTER` and the existing `GAMES` array.
- Produces: a `CurriculumPage` selected by the `curriculum` navigation route.

- [ ] **Step 1: Write the failing route assertion**

```js
import { readFileSync } from 'node:fs'
const source = readFileSync('src/App.tsx', 'utf8')
assert.match(source, /navTo\('curriculum'\)/)
assert.match(source, /BEGINNER_SEMESTER\.map/)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/beginnerCurriculum.test.ts`

Expected: FAIL because the Curriculum route has not been added.

- [ ] **Step 3: Add the route and concise list rendering**

```tsx
<button className={`nav-item ${page === 'curriculum' ? 'active' : ''}`} onClick={() => navTo('curriculum')}>Curriculum</button>
{page === 'curriculum' && <CurriculumPage />}
```

Render an ordered card per session with its week number, focus, six game titles, and `6 min` labels. Add responsive styles that reuse the site’s existing card, type, and color conventions.

- [ ] **Step 4: Run build and tests**

Run: `npm run build && node --experimental-strip-types --test tests/beginnerCurriculum.test.ts`

Expected: both commands succeed.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.css tests/beginnerCurriculum.test.ts
git commit -m "feat: publish beginner curriculum tab"
```
