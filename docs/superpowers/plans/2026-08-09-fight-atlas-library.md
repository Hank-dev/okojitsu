# Fight Atlas Game Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the utilitarian split-pane Game Library with the approved Fight Atlas experience while preserving and strengthening search, filters, game details, and create/edit flows.

**Architecture:** Keep library state and existing create/edit integration in `App.tsx`, extract pure search/filter/goal-label logic into `src/library.ts`, and test that module with Node's built-in test runner. Replace the compact list markup with a featured result, responsive card grid, filter drawer, active chips, and detail overlay; isolate the visual change under `atlas-*` CSS classes in `src/index.css`.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, CSS, Node test runner

## Global Constraints

- No new runtime or development dependencies.
- Preserve the existing `Game` schema and local persistence behavior.
- All game and category counts must be computed from the combined built-in/custom game collection.
- Game titles and action buttons do not use emoji; category controls may retain category symbols.
- Mixed games expose each player's inferred continuous or terminal goal type.
- Search, category, level, type, and skill filters combine.
- Desktop, tablet, and mobile layouts must not create horizontal page overflow.
- Create/edit behavior and complete game-detail content remain intact.

---

### Task 1: Tested library discovery model

**Files:**
- Create: `src/library.ts`
- Create: `tests/library.test.ts`
- Modify: `package.json`
- Modify: `src/App.tsx:1-35`

**Interfaces:**
- Consumes: `Game` and `Skill` from `src/types.ts`
- Produces: `LibraryFilters`, `gameMatchesSearch(game, query)`, `filterGames(games, filters)`, `countGamesByCategory(games)`, and `getPlayerGoalType(game, playerIndex)`

- [ ] **Step 1: Write failing discovery-model tests**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Game } from '../src/types.ts'
import {
  countGamesByCategory,
  filterGames,
  gameMatchesSearch,
  getPlayerGoalType,
} from '../src/library.ts'

const mixed: Game = {
  id: 'mixed',
  title: 'Feet Off',
  category: 'guard-passing',
  source: 'Test',
  level: 'beginner',
  type: 'mixed',
  startingPosition: 'Top stands over supine guard',
  players: [
    { role: 'Passer', objective: 'Keep the feet away', winCondition: 'Continuous - maintain posture.', constraints: ['No knees down'] },
    { role: 'Guard', objective: 'Make the passer sit', winCondition: 'Passer touches their butt to the mat.', constraints: [] },
  ],
  constraints: ['Reset after a score'],
  designRationale: 'Trains connection and balance.',
  tags: ['warmup'],
  skills: ['connection'],
  progression: null,
}

test('searches objectives, win conditions, roles, constraints, position, category, tags, and skills', () => {
  for (const query of ['keep the feet', 'touches their butt', 'passer', 'no knees', 'supine', 'guard-passing', 'warmup', 'connection']) {
    assert.equal(gameMatchesSearch(mixed, query), true)
  }
})

test('combines category, level, type, skill, and query filters', () => {
  assert.deepEqual(filterGames([mixed], {
    category: 'guard-passing',
    level: 'beginner',
    type: 'mixed',
    skill: 'connection',
    query: 'balance',
  }), [mixed])
  assert.deepEqual(filterGames([mixed], {
    category: 'guard',
    level: 'beginner',
    type: 'mixed',
    skill: 'connection',
    query: '',
  }), [])
})

test('counts categories from live games', () => {
  assert.deepEqual(countGamesByCategory([mixed, { ...mixed, id: 'second' }]), {
    all: 2,
    'guard-passing': 2,
  })
})

test('infers each player goal type in mixed games', () => {
  assert.equal(getPlayerGoalType(mixed, 0), 'continuous')
  assert.equal(getPlayerGoalType(mixed, 1), 'terminal')
})
```

- [ ] **Step 2: Add and run the test script to verify failure**

Add to `package.json`:

```json
"test:library": "node --experimental-strip-types --test tests/library.test.ts"
```

Run: `npm run test:library`

Expected: FAIL because `src/library.ts` does not exist.

- [ ] **Step 3: Implement the pure discovery model**

```ts
import type { Game, Skill } from './types'

export interface LibraryFilters {
  category: string
  level: string
  type: string
  skill: string
  query: string
}

export function gameMatchesSearch(game: Game, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const values = [
    game.title,
    game.category,
    game.startingPosition,
    game.designRationale ?? '',
    game.source,
    ...game.tags,
    ...game.skills,
    ...game.constraints,
    ...game.players.flatMap(player => [
      player.role,
      player.objective,
      player.winCondition,
      ...player.constraints,
    ]),
  ]
  return values.some(value => value.toLowerCase().includes(needle))
}

export function filterGames(games: Game[], filters: LibraryFilters): Game[] {
  return games.filter(game =>
    (filters.category === 'all' || game.category === filters.category) &&
    (filters.level === 'all' || game.level === filters.level) &&
    (filters.type === 'all' || game.type === filters.type) &&
    (filters.skill === 'all' || game.skills.includes(filters.skill as Skill)) &&
    gameMatchesSearch(game, filters.query)
  )
}

export function countGamesByCategory(games: Game[]): Record<string, number> {
  return games.reduce<Record<string, number>>((counts, game) => {
    counts.all = (counts.all ?? 0) + 1
    counts[game.category] = (counts[game.category] ?? 0) + 1
    return counts
  }, {})
}

export function getPlayerGoalType(game: Game, playerIndex: number): 'continuous' | 'terminal' {
  if (game.type === 'continuous') return 'continuous'
  if (game.type === 'terminal') return 'terminal'
  return /continuous|maintain|as long as/i.test(game.players[playerIndex]?.winCondition ?? '')
    ? 'continuous'
    : 'terminal'
}
```

Remove the local `gameMatchesSearch` function from `App.tsx` and import the five exports needed by the library.

- [ ] **Step 4: Run tests and build**

Run: `npm run test:library && npm run build`

Expected: all library tests pass and the production build succeeds.

- [ ] **Step 5: Commit the discovery model**

```bash
git add package.json src/library.ts tests/library.test.ts src/App.tsx
git commit -m "Test Fight Atlas library discovery"
```

---

### Task 2: Fight Atlas browse surface

**Files:**
- Modify: `src/App.tsx:535-810`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `filterGames`, `countGamesByCategory`, and `getPlayerGoalType` from Task 1
- Produces: `AtlasGameCard`, `AtlasFeaturedGame`, and the redesigned `LibraryPage` browse surface

- [ ] **Step 1: Add focused Atlas presentation components**

Replace `CompactGameItem` with:

```tsx
function AtlasGameCard({ game, custom, onOpen }: {
  game: Game
  custom: boolean
  onOpen: () => void
}) {
  const category = CATEGORY_META[game.category] ?? CATEGORY_META.submissions
  return (
    <button
      type="button"
      className="atlas-card"
      style={{ '--atlas-accent': category.color } as React.CSSProperties}
      onClick={onOpen}
    >
      <span className="atlas-card-kicker">{category.label}{custom ? ' · Custom' : ''}</span>
      <strong className="atlas-card-title">{game.title}</strong>
      <span className="atlas-card-summary">{game.designRationale || game.startingPosition}</span>
      <span className="atlas-card-duel">
        {game.players.slice(0, 2).map((player, index) => (
          <span key={index}>
            <small>{player.role} · {getPlayerGoalType(game, index)}</small>
            <b>{player.objective}</b>
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
```

Add `AtlasFeaturedGame` using the same category accent and both player objective/goal-type pairs. Its action calls the same `onOpen` handler as a card.

- [ ] **Step 2: Replace the split-pane library markup**

Keep the existing state variables and form callbacks. Add `filtersOpen` state, derive `categoryCounts`, and render:

```tsx
<div className="atlas-page">
  <header className="atlas-hero">
    <span className="atlas-eyebrow">The training game atlas</span>
    <h1>Find the right problem for today's round.</h1>
    <p>{allGames.length} games for better decisions.</p>
  </header>
  <div className="atlas-toolbar">
    <label className="atlas-search">
      <span>Search games</span>
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Position, objective, skill, or game name" />
    </label>
    <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}>Filters</button>
    {isAdmin && <button type="button" onClick={() => setShowForm(true)}>Create game</button>}
  </div>
  <div className="atlas-categories">
    <button type="button" aria-pressed={activeTab === 'all'} onClick={() => setActiveTab('all')}>All <b>{categoryCounts.all}</b></button>
    {categoriesPresent.map(([key, meta]) => (
      <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}>
        {meta.label} <b>{categoryCounts[key]}</b>
      </button>
    ))}
  </div>
  {filtersOpen && (
    <div className="atlas-filter-panel">
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
    </div>
  )}
  <div className="atlas-active-filters">
    {activeTab !== 'all' && <button type="button" onClick={() => setActiveTab('all')}>{CATEGORY_META[activeTab]?.label} ×</button>}
    {level !== 'all' && <button type="button" onClick={() => setLevel('all')}>{LEVEL_META[level]?.label} ×</button>}
    {type !== 'all' && <button type="button" onClick={() => setType('all')}>{TYPE_META[type]?.label} ×</button>}
    {skillFilter !== 'all' && <button type="button" onClick={() => setSkillFilter('all')}>{SKILL_META[skillFilter as Skill]?.label} ×</button>}
  </div>
  {filtered[0] && <AtlasFeaturedGame game={filtered[0]} onOpen={() => setFocused(filtered[0].id)} />}
  <div className="atlas-results-head">
    <span>{filtered.length} matching {filtered.length === 1 ? 'game' : 'games'}</span>
    <strong>Browse the atlas</strong>
  </div>
  <div className="atlas-grid">
    {filtered.map(game => (
      <AtlasGameCard
        key={game.id}
        game={game}
        custom={customIds.has(game.id)}
        onOpen={() => setFocused(game.id)}
      />
    ))}
  </div>
  {filtered.length === 0 && (
    <div className="atlas-empty">
      <strong>No games match these filters.</strong>
      <button type="button" onClick={clearFilters}>Reset filters</button>
      {isAdmin && <button type="button" onClick={() => setShowForm(true)}>Create game</button>}
    </div>
  )}
</div>
```

The clear-all action sets category, level, type, and skill to `all` and search to an empty string. Each active chip only clears its own filter.

- [ ] **Step 3: Add scoped Fight Atlas styling**

Add `atlas-*` rules implementing:

- Existing `--bg`, `--surface`, `--accent`, `--border`, and text tokens
- Wide editorial header without a new image dependency
- Sticky-capable toolbar with prominent search
- Horizontally scrollable category row
- Three-column cards above 1080px, two columns from 700px, one column below 700px
- Category-colored card top border and focus outline
- Two-player objective preview that wraps safely
- Reduced-motion override for hover transitions

Do not remove shared detail/form CSS in this task.

- [ ] **Step 4: Run behavior tests and build**

Run: `npm run test:library && npm run build`

Expected: tests pass and Vite produces the Sites bundle.

- [ ] **Step 5: Commit the browse surface**

```bash
git add src/App.tsx src/index.css
git commit -m "Build Fight Atlas game browser"
```

---

### Task 3: Detail overlay and preserved browse state

**Files:**
- Modify: `src/App.tsx:552-810`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `focusedGame`, existing `GameDetailInline`, existing create/edit callbacks, and `getPlayerGoalType`
- Produces: accessible `atlas-detail-overlay` behavior with unchanged detail content

- [ ] **Step 1: Upgrade detail labels for per-player goal types**

In each player panel, render:

```tsx
<span className={`detail-goal-type detail-goal-${getPlayerGoalType(game, i)}`}>
  {getPlayerGoalType(game, i) === 'continuous' ? 'Continuous success condition' : 'Terminal win condition'}
</span>
```

Change the static `Win condition` key to `Condition`. Keep objective, condition text, player constraints, rationale, progression, source, and edit action.

- [ ] **Step 2: Render detail above the browse page**

```tsx
{focusedGame && (
  <div className="atlas-detail-overlay" role="dialog" aria-modal="true" aria-label={focusedGame.title}>
    <div className="atlas-detail-shell">
      <GameDetailInline
        game={focusedGame}
        onClose={() => setFocused(null)}
        onEdit={isAdmin ? () => setEditGameData(focusedGame) : undefined}
        onNavigate={game => setFocused(game.id)}
      />
    </div>
  </div>
)}
```

Retain search, filters, and the underlying result DOM while details are open. Lock body scrolling in an effect only while `focusedGame` exists, and close on Escape.

- [ ] **Step 3: Restore focus to the triggering game**

Store the selected game id before opening. Add `data-game-id={game.id}` to each card and feature action. After close, schedule focus to:

```ts
document.querySelector<HTMLElement>(`[data-game-id="${lastFocusedId.current}"]`)?.focus()
```

Do not reset any search/filter state when opening or closing details.

- [ ] **Step 4: Add responsive detail styling**

Desktop uses a centered, scrollable shell with a dim backdrop. Below 700px, the overlay and shell fill the viewport and the close action remains visible at the top. Ensure no `position: absolute` child is placed inside an overflow-auto content region.

- [ ] **Step 5: Run tests and build**

Run: `npm run test:library && npm run test:admin && npm run test:sites-build && npm run build`

Expected: all tests pass and production build succeeds.

- [ ] **Step 6: Commit detail behavior**

```bash
git add src/App.tsx src/index.css
git commit -m "Preserve Fight Atlas detail context"
```

---

### Task 4: Responsive and production verification

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/index.css`

**Interfaces:**
- Consumes: completed Fight Atlas implementation
- Produces: verified production-ready library

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
npm run test:library
npm run test:admin
npm run test:sites-build
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Verify discovery scenarios**

At a representative desktop viewport:

1. Search for text present only in a player objective.
2. Search for text present only in a win/success condition.
3. Search for a constraint.
4. Combine a category, level, type, skill, and search term.
5. Clear one chip and verify the other filters remain.
6. Clear all and verify the full live count returns.
7. Force an empty result and use reset.

Expected: result cards and counts update correctly in every scenario.

- [ ] **Step 3: Verify detail and administration scenarios**

1. Open terminal, continuous, and mixed games.
2. Confirm both player goal labels and condition text.
3. Close detail and confirm search, filters, and scroll context remain.
4. As admin, open create and edit flows and cancel without losing library state.
5. Save a custom game and confirm it appears in the Atlas.

Expected: complete detail content and existing administration behavior remain intact.

- [ ] **Step 4: Verify responsive layouts**

Check 1440×1000 and 390×844:

- No horizontal page overflow
- Category tabs scroll within their own row
- Cards render three columns on desktop and one on mobile
- Filter controls remain usable
- Mobile detail fills the viewport and returns to results
