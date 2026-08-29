# Live Shared Game Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every signed-in admin jointly create and edit private live game drafts, then publish or discard them safely.

**Architecture:** D1 holds active draft records separately from published custom games. The Worker exposes admin-only draft endpoints that merge field-level patches with optimistic revisions. The game-library form becomes a live-draft form: it debounces individual field updates, polls every second, preserves the local active input, and lists drafts that other admins can join.

**Tech Stack:** React 19, TypeScript, Vite, Cloudflare Worker, Cloudflare D1, Drizzle migrations, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-24-live-game-drafts-design.md`

## Global Constraints

- Use the existing shared admin cookie as the only authorization mechanism; public visitors must never receive draft data.
- Keep drafts in D1, not browser storage.
- Debounce changed form fields for exactly 400ms and poll an open draft every 1000ms.
- Merge changes to different fields; for the same field, the last received update wins.
- Do not add named accounts, presence indicators, cursors, WebSockets, CRDTs, or new dependencies.
- Continue normalizing saved games to `level: 'beginner'`.
- Preserve the existing category-creation workflow, but keep a newly proposed category in the draft until publishing.
- Run `npm run db:generate` after changing `db/schema.ts`, inspect the SQL migration, and include it in the deployed build.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/sharedGameDrafts.ts` | Shared draft types, blank draft factory, allowed patch validation, patch application, and draft parsing. |
| `src/server/gameDraftStore.ts` | D1 reads/writes for active drafts, including revision-guarded replacement. |
| `src/server/worker.ts` | Admin-only draft routes and publish orchestration with the existing game/category stores. |
| `src/gameDraftApi.ts` | Browser client for creating, reading, patching, publishing, and discarding drafts. |
| `src/useLiveGameDraft.ts` | React hook for 400ms per-field autosave, one-second refresh, active-field protection, and save state. |
| `src/App.tsx` | Admin Live drafts area and the game-form conversion from one-time save to collaborative publish/discard. |
| `db/schema.ts`, `drizzle/*` | `game_drafts` D1 table and its partial unique source-game index. |
| `tests/gameDrafts.test.ts` | Unit coverage for patch paths, draft updates, and active-field merge protection. |
| `tests/gameDraftStore.test.ts` | D1 store creation, source-game joining, compare-and-swap update, and deletion coverage. |
| `tests/gameDraftWorker.test.ts` | Worker authorization, field-patch, publish, and discard behavior. |
| `tests/gameDraftApi.test.ts` | Same-origin draft API call coverage. |
| `tests/visualContract.test.mjs`, `tests/sitesBuild.test.mjs` | Live-draft UI and migration packaging contracts. |

## Shared interfaces

The first task establishes these names for all later tasks:

```ts
export type DraftPublishMode = 'create' | 'replace'

export interface PendingCategory {
  label: string
  emoji: string
}

export interface GameDraft {
  id: string
  sourceGameId: string | null
  publishMode: DraftPublishMode
  game: Game
  pendingCategory: PendingCategory | null
  revision: number
  createdAt: string
  updatedAt: string
}

export interface GameDraftSummary {
  id: string
  sourceGameId: string | null
  title: string
  updatedAt: string
}

export interface GameDraftPatch {
  path: GameDraftPatchPath
  value: string | string[] | null
}

export type GameDraftPatchPath =
  | 'title' | 'category' | 'level' | 'type' | 'source' | 'startingPosition'
  | 'designRationale' | 'tags' | 'pendingCategory' | 'pendingCategory.label'
  | 'pendingCategory.emoji' | `players.${0 | 1}.role`
  | `players.${0 | 1}.objective` | `players.${0 | 1}.winCondition`
  | `players.${0 | 1}.constraints`
```

## Task 1: Define safe, mergeable draft data

**Files:**
- Create: `src/sharedGameDrafts.ts`
- Create: `tests/gameDrafts.test.ts`
- Modify: `src/types.ts`

**Consumes:** `Game`, `PlayerRole`, and `Skill` from `src/types.ts`.

**Produces:** `GameDraft`, `GameDraftPatch`, `createBlankGameDraft`, `createGameDraftFromGame`, `categoryKey`, `isGameDraftPatch`, `applyGameDraftPatches`, `isGameDraft`, and `mergeRemoteDraft`.

- [ ] **Step 1: Write the failing draft-behavior tests**

```ts
test('applies changes to different draft fields without dropping either change', () => {
  const draft = createBlankGameDraft('draft-new')
  const afterTitle = applyGameDraftPatches(draft, [{ path: 'title', value: 'Turtle Circle' }])
  const afterObjective = applyGameDraftPatches(afterTitle, [{ path: 'players.1.objective', value: 'Open the turtle' }])

  assert.equal(afterObjective.game.title, 'Turtle Circle')
  assert.equal(afterObjective.game.players[1].objective, 'Open the turtle')
})

test('keeps an active local field while applying a remote draft update', () => {
  const local = applyGameDraftPatches(createBlankGameDraft('draft-new'), [{ path: 'title', value: 'Local typing' }])
  const remote = applyGameDraftPatches(createBlankGameDraft('draft-new'), [{ path: 'source', value: 'Seminar' }])

  const merged = mergeRemoteDraft(local, remote, 'title')
  assert.equal(merged.game.title, 'Local typing')
  assert.equal(merged.game.source, 'Seminar')
})

test('rejects an unapproved draft patch path', () => {
  assert.equal(isGameDraftPatch({ path: 'game.id', value: 'other-id' }), false)
})
```

- [ ] **Step 2: Run the draft-behavior test to verify it fails**

Run: `node --experimental-strip-types --test tests/gameDrafts.test.ts`

Expected: FAIL because `src/sharedGameDrafts.ts` and its exported helpers do not exist.

- [ ] **Step 3: Add the shared draft types and minimal patch helpers**

Implement `src/sharedGameDrafts.ts` with a blank game that has a stable `custom-${crypto.randomUUID()}` ID, two empty player records, `level: 'beginner'`, `skills: ['connection']`, and no pending category. Move the existing category-label slug logic from `src/App.tsx` into exported `categoryKey(label: string)` so both the browser form and publish route use the same category key. Clone every nested player and constraint array before changing it.

```ts
export function applyGameDraftPatches(draft: GameDraft, patches: GameDraftPatch[]): GameDraft {
  return patches.reduce((next, patch) => {
    if (!isGameDraftPatch(patch)) throw new Error('Invalid draft patch.')
    return applyOnePatch(next, patch)
  }, cloneDraft(draft))
}

export function mergeRemoteDraft(local: GameDraft, remote: GameDraft, activePath: GameDraftPatchPath | null) {
  if (!activePath) return remote
  return applyGameDraftPatches(remote, [readPatchAtPath(local, activePath)])
}
```

`isGameDraft` must accept incomplete strings in a draft but require a stable ID, exactly two player objects, arrays for tags/constraints, a `beginner` or `all-levels` draft level, a valid publish mode, non-negative revision, and valid timestamps. Keep complete-game validation in `isGame` for publishing only.

- [ ] **Step 4: Run the draft-behavior test to verify it passes**

Run: `node --experimental-strip-types --test tests/gameDrafts.test.ts`

Expected: PASS with the three draft behaviors green.

- [ ] **Step 5: Commit the shared draft model**

```bash
git add src/types.ts src/sharedGameDrafts.ts tests/gameDrafts.test.ts
git commit -m "feat: define live game draft model"
```

## Task 2: Persist active drafts with revision guards

**Files:**
- Modify: `db/schema.ts`
- Create: `src/server/gameDraftStore.ts`
- Create: `tests/gameDraftStore.test.ts`
- Modify: `package.json`
- Create: generated `drizzle/0002_*.sql` migration and `drizzle/meta/0002_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Consumes:** `GameDraft` and `GameDraftSummary` from `src/sharedGameDrafts.ts`; `D1Database` and D1 statement contracts from `src/server/sessionStore.ts`.

**Produces:** `GameDraftStore` and `D1GameDraftStore` with `list`, `get`, `findBySourceGameId`, `create`, `replaceIfRevision`, and `delete`.

- [ ] **Step 1: Write the failing D1 store tests**

```ts
test('returns the existing active draft for the same source game', async () => {
  const store = new D1GameDraftStore(new MemoryD1())
  const created = await store.create(createGameDraftFromGame('draft-1', customGame, 'replace'))
  const existing = await store.findBySourceGameId(customGame.id)

  assert.equal(created?.id, existing?.id)
})

test('rejects a stale revision without overwriting a newer field patch', async () => {
  const store = new D1GameDraftStore(new MemoryD1())
  const draft = await store.create(createBlankGameDraft('draft-1'))
  const first = applyGameDraftPatches(draft!, [{ path: 'title', value: 'First title' }])
  assert.ok(await store.replaceIfRevision(first, 0))

  const stale = applyGameDraftPatches(draft!, [{ path: 'source', value: 'Seminar' }])
  assert.equal(await store.replaceIfRevision(stale, 0), null)
})
```

- [ ] **Step 2: Run the store test to verify it fails**

Run: `node --import tsx --test tests/gameDraftStore.test.ts`

Expected: FAIL because `src/server/gameDraftStore.ts` does not exist.

- [ ] **Step 3: Add the D1 schema and store**

Add this table to `db/schema.ts`, using a partial unique index to allow many new-game drafts while allowing only one draft per existing game:

```ts
export const gameDrafts = sqliteTable('game_drafts', {
  id: text('id').primaryKey(),
  sourceGameId: text('source_game_id'),
  payloadJson: text('payload_json').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_game_drafts_updated_at').on(table.updatedAt),
  uniqueIndex('uq_game_drafts_source_game').on(table.sourceGameId).where(sql`${table.sourceGameId} is not null`),
])
```

Implement the revision guard with one `UPDATE` statement so only the expected revision can write:

```ts
async replaceIfRevision(draft: GameDraft, expectedRevision: number) {
  const result = await this.db.prepare(
    'UPDATE game_drafts SET payload_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?',
  ).bind(JSON.stringify(draft), expectedRevision + 1, now(), draft.id, expectedRevision).run()
  return changes(result) > 0 ? { ...draft, revision: expectedRevision + 1 } : null
}
```

Store timestamps outside the payload as table columns and set the returned draft's `updatedAt` to the same value used in the update. Add `test:game-draft-store` to `package.json`.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`

Expected: Drizzle creates a migration that adds `game_drafts`, `idx_game_drafts_updated_at`, and the partial unique source-game index. Read the generated SQL and confirm it contains no table rebuild or destructive statements.

- [ ] **Step 5: Run the store test to verify it passes**

Run: `npm run test:game-draft-store`

Expected: PASS, including existing-draft joining and stale-revision rejection.

- [ ] **Step 6: Commit the D1 draft store and migration**

```bash
git add db/schema.ts drizzle package.json src/server/gameDraftStore.ts tests/gameDraftStore.test.ts
git commit -m "feat: persist live game drafts"
```

## Task 3: Add protected live-draft Worker routes

**Files:**
- Modify: `src/server/worker.ts`
- Create: `tests/gameDraftWorker.test.ts`
- Modify: `tests/sitesBuild.test.mjs`

**Consumes:** `D1GameDraftStore`, `GameDraftStore`, `applyGameDraftPatches`, `isGameDraftPatch`, `isGame`, `D1CustomGameStore`, and `D1CustomCategoryStore`.

**Produces:** Admin-only `/api/game-drafts` routes that list, create/join, read, patch, publish, and discard drafts.

- [ ] **Step 1: Write the failing Worker route tests**

```ts
test('does not expose live drafts to visitors without an admin session', async () => {
  const response = await worker.fetch(request('/api/game-drafts'))
  assert.equal(response.status, 401)
})

test('merges separate admin patches after a revision retry', async () => {
  const draft = await createDraft(worker, createBlankGameDraft('draft-1'))
  await patchDraft(worker, draft.id, draft.revision, [{ path: 'title', value: 'Turtle Circle' }])
  const updated = await patchDraft(worker, draft.id, draft.revision, [{ path: 'source', value: 'Seminar' }])

  assert.equal(updated.game.title, 'Turtle Circle')
  assert.equal(updated.game.source, 'Seminar')
})

test('publishes a complete draft and removes it from the admin draft list', async () => {
  const draft = await createDraft(worker, createGameDraftFromGame('draft-1', customGame, 'create'))
  const published = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(published.status, 201)
  assert.deepEqual((await listDrafts(worker)), [])
})
```

- [ ] **Step 2: Run the Worker test to verify it fails**

Run: `node --import tsx --test tests/gameDraftWorker.test.ts`

Expected: FAIL because the Worker has no `/api/game-drafts` routes or draft-store dependency.

- [ ] **Step 3: Implement the Worker draft routes and retry merge**

Extend `WorkerDependencies` with an optional `draftStore`, instantiate `D1GameDraftStore(environment.DB)`, and re-export its interface for the test fake. Add an admin-session check before every draft route, including `GET`.

For `PATCH`, retry a stale compare-and-swap up to three times by reading the newest draft and applying the same validated patches:

```ts
async function patchDraft(store: GameDraftStore, id: string, patches: GameDraftPatch[]) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.get(id)
    if (!current) return null
    const next = applyGameDraftPatches(current, patches)
    const saved = await store.replaceIfRevision(next, current.revision)
    if (saved) return saved
  }
  throw new DraftConflictError()
}
```

Route behavior:

```text
GET    /api/game-drafts                 -> { drafts: GameDraftSummary[] }
POST   /api/game-drafts                 -> { draft: GameDraft }, creates or joins sourceGameId
GET    /api/game-drafts/:id             -> { draft: GameDraft }
PATCH  /api/game-drafts/:id             -> { draft: GameDraft }, body { patches: GameDraftPatch[] }
POST   /api/game-drafts/:id/publish     -> { game: Game }, creates/replaces then deletes draft
DELETE /api/game-drafts/:id             -> 204
```

For publication, convert a non-null `pendingCategory` into a category key using the existing `categoryKey` rules moved into `src/sharedGameDrafts.ts`; reject collision with a 409, upsert the category, set the game category, validate with `isGame`, force `level: 'beginner'`, then call `create` or `replace` based on `publishMode`. Delete the draft only after the game save succeeds. Return 400 for incomplete game data, 404 for missing drafts, and 409 for exhausted revision retries or duplicate final-game IDs.

Update `tests/sitesBuild.test.mjs` to assert the generated draft migration is packaged under `dist/.openai/drizzle`.

- [ ] **Step 4: Run the Worker and build-package tests to verify they pass**

Run: `node --import tsx --test tests/gameDraftWorker.test.ts && npm run build && npm run test:sites-build`

Expected: all tests pass and the built archive includes the new migration.

- [ ] **Step 5: Commit the protected draft API**

```bash
git add src/server/worker.ts tests/gameDraftWorker.test.ts tests/sitesBuild.test.mjs
git commit -m "feat: add admin live draft API"
```

## Task 4: Add a browser draft client and collaboration hook

**Files:**
- Create: `src/gameDraftApi.ts`
- Create: `src/useLiveGameDraft.ts`
- Create: `tests/gameDraftApi.test.ts`
- Modify: `tests/gameDrafts.test.ts`
- Modify: `package.json`

**Consumes:** `GameDraft`, `GameDraftPatch`, `mergeRemoteDraft`, and the Worker routes from earlier tasks.

**Produces:** `createGameDraft`, `fetchGameDrafts`, `fetchGameDraft`, `patchGameDraft`, `publishGameDraft`, `deleteGameDraft`, and `useLiveGameDraft`.

- [ ] **Step 1: Write failing browser client and hook-helper tests**

```ts
test('sends individual patches to the same-origin live draft endpoint', async () => {
  await patchGameDraft('draft-1', [{ path: 'title', value: 'Turtle Circle' }])

  assert.equal(calls[0].url, '/api/game-drafts/draft-1')
  assert.equal(calls[0].init?.method, 'PATCH')
  assert.equal(calls[0].init?.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    patches: [{ path: 'title', value: 'Turtle Circle' }],
  })
})

test('uses a 400ms debounce delay and a 1000ms refresh interval', () => {
  assert.deepEqual(LIVE_DRAFT_TIMING, { saveDelayMs: 400, pollIntervalMs: 1000 })
})
```

- [ ] **Step 2: Run the new browser tests to verify they fail**

Run: `node --experimental-strip-types --test tests/gameDraftApi.test.ts tests/gameDrafts.test.ts`

Expected: FAIL because the draft API module and collaboration timing export do not exist.

- [ ] **Step 3: Implement the browser client and hook**

Use the same `responseJson` error pattern as `src/gameApi.ts`. Keep every request `credentials: 'same-origin'`.

```ts
export const LIVE_DRAFT_TIMING = { saveDelayMs: 400, pollIntervalMs: 1000 } as const

export function useLiveGameDraft(initial: GameDraft, onPublished: (game: Game) => void) {
  const [draft, setDraft] = useState(initial)
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const activePathRef = useRef<GameDraftPatchPath | null>(null)
  const timersRef = useRef(new Map<GameDraftPatchPath, number>())

  const update = useCallback((patch: GameDraftPatch) => {
    setDraft(current => applyGameDraftPatches(current, [patch]))
    window.clearTimeout(timersRef.current.get(patch.path))
    timersRef.current.set(patch.path, window.setTimeout(() => void save([patch]), LIVE_DRAFT_TIMING.saveDelayMs))
  }, [save])
  // poll with fetchGameDraft(draft.id); use mergeRemoteDraft(current, remote, activePathRef.current)
}
```

The hook must clear every timeout and polling interval on unmount, retain unsaved local input after a failed patch, expose `retry`, and surface `published` or `discarded` as a terminal remote state to the form. It must never write draft records to `localStorage`.

- [ ] **Step 4: Run the browser tests to verify they pass**

Run: `npm run test:game-draft-api && node --experimental-strip-types --test tests/gameDrafts.test.ts`

Expected: PASS with same-origin calls and exact live-draft timing values.

- [ ] **Step 5: Commit the browser collaboration layer**

```bash
git add src/gameDraftApi.ts src/useLiveGameDraft.ts tests/gameDraftApi.test.ts tests/gameDrafts.test.ts package.json
git commit -m "feat: sync live game draft changes"
```

## Task 5: Turn the game form into a shared live-draft workspace

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `tests/visualContract.test.mjs`

**Consumes:** `createBlankGameDraft`, `createGameDraftFromGame`, `createGameDraft`, `fetchGameDrafts`, `useLiveGameDraft`, and the existing shared-games refresh callback.

**Produces:** an admin-only Live drafts list, live creation/editing flows, and publish/discard actions.

- [ ] **Step 1: Write the failing visible-behavior contracts**

```js
test('gives admins a private entry point to active shared game drafts', () => {
  assert.match(app, /Live drafts/)
  assert.match(app, /fetchGameDrafts\(\)/)
  assert.match(app, /createGameDraft\(/)
})

test('labels the collaborative form and exposes publish and discard controls', () => {
  const gameForm = app.slice(app.indexOf('function GameForm'))
  assert.match(gameForm, /Live draft/)
  assert.match(gameForm, /Publish game/)
  assert.match(gameForm, /Discard draft/)
})
```

- [ ] **Step 2: Run the visual contract test to verify it fails**

Run: `npm run test:visual-contract`

Expected: FAIL because the library has no live-draft list and the form has only Save Game.

- [ ] **Step 3: Integrate live drafts into the library and form**

In `LibraryPage`, add `liveDrafts` state and an admin-only polling effect that calls `fetchGameDrafts()` every 1000ms. Render a compact `Live drafts` section above the game grid with each draft title (falling back to `Untitled game`) and a button that opens it.

Replace `showForm` and `editGameData` with one `activeDraft: GameDraft | null` flow:

```ts
const openNewDraft = async () => {
  setActiveDraft(await createGameDraft(createBlankGameDraft(`draft-${crypto.randomUUID()}`)))
}

const openEditDraft = async (game: Game) => {
  const isCustom = customIds.has(game.id)
  const draftGame = isCustom ? game : { ...game, id: `custom-${crypto.randomUUID()}` }
  setActiveDraft(await createGameDraft(createGameDraftFromGame(`draft-${crypto.randomUUID()}`, draftGame, isCustom ? 'replace' : 'create', game.id)))
}
```

Update `GameForm` to receive `draft` instead of `editGame`. Use `useLiveGameDraft` inside the form, route every input through a typed field patch, call `beginField(path)` on focus and `endField(path)` on blur, and display the hook state as `Saving…`, `Saved`, or a retryable error. Store the new-category name and emoji in `draft.pendingCategory`; publish creates the category through the server route rather than calling `createSharedCategory` from the form.

Replace Save Game with **Publish game**. It calls `publish()` and then `refreshSharedGames()` so the library, builder, and sessions receive the published record. Add **Discard draft** with a confirmation, then `deleteGameDraft()`, refresh the Live drafts list, and close the modal. Closing the modal must preserve the draft.

Add focused CSS for `.live-drafts`, `.live-draft-status`, and `.live-draft-action` using existing black surfaces, border tokens, and 44px minimum touch targets. Do not add gradients or a new color palette.

- [ ] **Step 4: Run UI contracts and type checks to verify they pass**

Run: `npm run test:visual-contract && npx tsc --noEmit`

Expected: PASS with the live-draft UI markers present and no TypeScript errors.

- [ ] **Step 5: Commit the collaborative form**

```bash
git add src/App.tsx src/index.css tests/visualContract.test.mjs
git commit -m "feat: collaborate on live game drafts"
```

## Task 6: Run full verification and prepare the production version

**Files:**
- Modify only files required to correct a failing verification.

**Consumes:** The finished D1 migration, Worker API, browser client, and collaborative form.

**Produces:** A clean, buildable source tree ready for the normal Sites save-and-deploy workflow.

- [ ] **Step 1: Run all feature and regression tests**

Run:

```bash
npm run test:game-draft-store
npm run test:game-draft-api
node --import tsx --test tests/gameDraftWorker.test.ts
npm run test:custom-game-store
npm run test:custom-game-worker
npm run test:game-api
npm run test:session-store
npm run test:session-worker
npm run test:session-api
npm run test:library
npm run test:sessions
npm run test:shared-sessions
npm run test:admin
npm run test:field-manual
npm run test:visual-contract
```

Expected: every command exits 0.

- [ ] **Step 2: Build the production bundle and verify migration packaging**

Run: `npm run build && npm run test:sites-build`

Expected: the Worker bundle builds, the client bundle builds, and the new generated `game_drafts` migration exists under `dist/.openai/drizzle`.

- [ ] **Step 3: Inspect final source state**

Run: `git status --short && git diff --check`

Expected: no unexpected files, no whitespace errors, and only intentional tracked changes before the final commit.

## Plan self-review

- Spec coverage: Tasks 1–3 enforce private D1-backed drafts, field-level merge, publish/discard, and admin-only access. Task 4 implements exact autosave/polling and active-field protection. Task 5 adds simultaneous admin editing and the Live drafts UI. Task 6 validates the migration and entire site.
- Placeholder scan: the plan contains no incomplete tasks or unspecified validation behavior; each operation, route, test command, and failure expectation is explicit.
- Type consistency: every later task uses the `GameDraft`, `GameDraftPatch`, `GameDraftStore`, and browser API names defined in the shared interfaces and preceding tasks.
