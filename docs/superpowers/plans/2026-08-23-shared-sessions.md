# Shared Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make administrator-created ØkoJitsu sessions durable and visible from every browser, with a safe one-time import for classes that currently exist only in browser storage.

**Architecture:** A D1-backed `sessions` table becomes the authoritative collection. A bundled Cloudflare Worker exposes public reads and cookie-protected mutations, while the React app loads and changes sessions through a small client API. Browser storage is used only to discover and publish legacy local sessions; it is never the post-migration source of truth.

**Tech Stack:** React 19, TypeScript, Vite, Cloudflare Worker, Cloudflare D1, Drizzle migrations, Node built-in test runner, OpenAI Sites.

**Spec:** `docs/superpowers/specs/2026-08-23-shared-sessions-design.md`

## Global Constraints

- Everyone may read shared sessions; only the existing administrator cookie may create, import, edit, or delete them.
- Keep the existing `SessionPlan` and `SessionGame` payload shape, game order, duration values, notes, focus, and Copy & Edit behavior.
- Preserve custom games as device-local; this work syncs classes only.
- Existing browser sessions are imported only after an administrator explicitly presses **Publish local sessions**.
- Ignore historical deleted-seed strings in `okojitsu_sessions`; never render or upload them as sessions.
- Use D1 binding name `DB`, prepared statements, a generated Drizzle migration, and no browser storage as authoritative session data.
- Keep the existing black/acid-green visual system and 44px minimum touch targets.
- Do not add individual accounts, private session ownership, collaboration roles, comments, or version history.

---

## File Structure

- `db/schema.ts` — Drizzle schema for the shared `sessions` table.
- `drizzle/` — generated SQLite migration and metadata packaged with the site.
- `src/sharedSessions.ts` — pure session validation and legacy-local import parsing.
- `src/sessionApi.ts` — browser client for the session HTTP API.
- `src/server/sessionStore.ts` — D1 repository and seed initialization, isolated from request routing.
- `src/server/worker.ts` — cookie-aware HTTP routes plus static asset fallback.
- `scripts/create-sites-worker.mjs` — bundles the worker into `dist/server/index.js` and preserves hosting metadata.
- `src/App.tsx` — owns shared session loading, retries, and mutation callbacks.
- `src/SessionsPage.tsx` — displays shared-loading/error/import state and delegates deletion to App.
- `tests/sharedSessions.test.ts`, `tests/sessionApi.test.ts`, `tests/sessionWorker.test.ts` — regression coverage for parsing, requests, authorization, and routes.

### Task 1: Validate sessions and parse legacy browser data

**Files:**
- Create: `src/sharedSessions.ts`
- Create: `tests/sharedSessions.test.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export type LegacySessionParse = {
  sessions: SessionPlan[]
  ignoredCount: number
}

export function isSessionPlan(value: unknown): value is SessionPlan
export function parseLegacySessions(raw: string | null, seedIds: ReadonlySet<string>): LegacySessionParse
```

`parseLegacySessions` accepts only valid non-seed `SessionPlan` objects, removes duplicate ids while retaining the first record, and counts strings, malformed objects, and seed entries as ignored.

- [ ] **Step 1: Write the failing validation and migration tests**

Create `tests/sharedSessions.test.ts` with a complete valid session fixture, a duplicate variant, a seed-id variant, and malformed values. Add these cases:

```ts
test('accepts a complete SessionPlan and rejects malformed session-like values', () => {
  assert.equal(isSessionPlan(validSession), true)
  assert.equal(isSessionPlan({ ...validSession, title: '' }), false)
  assert.equal(isSessionPlan({ ...validSession, games: [{ gameId: 'x', duration: -1 }] }), false)
  assert.equal(isSessionPlan('seed-fundamentals'), false)
})

test('imports only valid non-seed local sessions once', () => {
  const parsed = parseLegacySessions(JSON.stringify([
    validSession,
    { ...validSession, title: 'Duplicate id' },
    { ...validSession, id: 'seed-fundamentals' },
    'seed-all-levels',
    { id: 'incomplete' },
  ]), new Set(['seed-fundamentals', 'seed-all-levels']))
  assert.deepEqual(parsed.sessions.map(session => session.id), [validSession.id])
  assert.equal(parsed.ignoredCount, 4)
})
```

- [ ] **Step 2: Add and run the test command to verify RED**

Add this script to `package.json`:

```json
"test:shared-sessions": "node --experimental-strip-types --test tests/sharedSessions.test.ts"
```

Run: `npm run test:shared-sessions`

Expected: FAIL because `src/sharedSessions.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure parser**

Create `src/sharedSessions.ts` using `SessionPlan` and `SessionGame` from `src/types.ts`. Require a nonempty `id`, `title`, `date`, and `level`; finite `duration >= 0`; string `focus` and `notes` values (empty strings remain valid); and an array of games with nonempty `gameId`, finite `duration >= 0`, and optional string `notes`. Catch JSON errors in `parseLegacySessions` and return `{ sessions: [], ignoredCount: 0 }` for an absent value or one malformed JSON value.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:shared-sessions`

Expected: all validation and migration tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json src/sharedSessions.ts tests/sharedSessions.test.ts
git commit -m "feat: validate shared session records"
```

### Task 2: Add the D1 schema, repository, and protected worker API

**Files:**
- Create: `db/schema.ts`
- Create: `drizzle.config.ts`
- Create: `src/server/sessionStore.ts`
- Create: `src/server/worker.ts`
- Create: `tests/sessionWorker.test.ts`
- Modify: `.openai/hosting.json`
- Modify: `package.json`
- Modify: `scripts/create-sites-worker.mjs`
- Create: generated `drizzle/0000_shared_sessions.sql` and Drizzle metadata

**Interfaces:**

```ts
export type SessionStore = {
  ensureSeedSessions(seeds: SessionPlan[]): Promise<void>
  list(): Promise<SessionPlan[]>
  create(session: SessionPlan): Promise<SessionPlan>
  replace(id: string, session: SessionPlan): Promise<SessionPlan | null>
  delete(id: string): Promise<boolean>
  importMissing(sessions: SessionPlan[]): Promise<SessionPlan[]>
}

export function createSessionStore(db: D1Database): SessionStore
export function createWorker(deps: { assets: Fetcher; store: SessionStore; isAdmin: (request: Request) => Promise<boolean>; seeds: SessionPlan[] }): { fetch(request: Request): Promise<Response> }
```

Define the small structural `D1Database`, `D1PreparedStatement`, `D1Result`, and `Fetcher` interfaces beside the server code so Node tests and the Cloudflare runtime agree without adding a platform type package. The production default worker constructs `store` from `env.DB`, uses the existing signed-cookie verification for `isAdmin`, and passes `SEED_SESSIONS` to `createWorker`.

- [ ] **Step 1: Write the failing worker route tests**

Create `tests/sessionWorker.test.ts` with an in-memory `SessionStore`, an asset fetcher, and an `isAdmin` callback controlled per test. Test:

```ts
test('allows any visitor to list shared sessions', async () => {
  const response = await worker.fetch(new Request('https://site.test/api/sessions'))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).sessions.map((session: SessionPlan) => session.id), ['shared-class'])
})

test('rejects anonymous session mutations', async () => {
  const response = await worker.fetch(new Request('https://site.test/api/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validSession),
  }))
  assert.equal(response.status, 401)
})

test('creates, imports missing sessions, replaces, and deletes for an administrator', async () => {
  const created = await worker.fetch(new Request('https://site.test/api/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validSession),
  }))
  assert.equal(created.status, 201)
  const importedSession = { ...validSession, id: 'imported-class' }
  const imported = await worker.fetch(new Request('https://site.test/api/sessions/import', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessions: [validSession, importedSession] }),
  }))
  assert.deepEqual((await imported.json()).imported.map((session: SessionPlan) => session.id), ['imported-class'])
  const replacement = { ...validSession, title: 'Edited class' }
  const updated = await worker.fetch(new Request(`https://site.test/api/sessions/${validSession.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(replacement),
  }))
  assert.equal((await updated.json()).session.title, 'Edited class')
  const deleted = await worker.fetch(new Request(`https://site.test/api/sessions/${validSession.id}`, { method: 'DELETE' }))
  assert.equal(deleted.status, 204)
  const listed = await worker.fetch(new Request('https://site.test/api/sessions'))
  assert.deepEqual((await listed.json()).sessions.map((session: SessionPlan) => session.id), ['imported-class'])
})
```

Add this script to `package.json`:

```json
"test:session-worker": "node --experimental-strip-types --test tests/sessionWorker.test.ts"
```

- [ ] **Step 2: Run the route test to verify RED**

Run: `npm run test:session-worker`

Expected: FAIL because the server modules do not exist.

- [ ] **Step 3: Define and generate the database migration**

Install `drizzle-orm` and `drizzle-kit`. Create `db/schema.ts` with a SQLite `sessions` table:

```ts
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  isSeed: integer('is_seed').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [index('idx_sessions_updated_at').on(table.updatedAt)])

export const sessionBootstrap = sqliteTable('session_bootstrap', {
  key: text('key').primaryKey(),
  completedAt: text('completed_at').notNull(),
})
```

Create `drizzle.config.ts` for the SQLite dialect, `db/schema.ts`, and `drizzle/` output. Generate the migration with:

```bash
npx drizzle-kit generate --config drizzle.config.ts
```

Inspect the generated SQL. It must create `sessions`, `session_bootstrap`, and `idx_sessions_updated_at` without destructive statements. Set `.openai/hosting.json` to:

```json
{ "project_id": "appgprj_6a6e1d9daa988191b711b4d724a475fa", "d1": "DB", "r2": null }
```

- [ ] **Step 4: Implement the isolated D1 store**

In `src/server/sessionStore.ts`, use exactly one prepared SQL statement per `db.prepare()` call. Serialize only `SessionPlan` data into `payload_json`; parse rows with `isSessionPlan` and ignore invalid rows. Implement:

- `list()` ordered by `updated_at DESC`.
- `create()` with `INSERT`, returning the submitted validated record.
- `replace()` with `UPDATE ... WHERE id = ?`, returning `null` when `meta.changes` is zero.
- `delete()` with `DELETE ... WHERE id = ?`.
- `importMissing()` with `INSERT OR IGNORE`, never overwriting an existing id.
- `ensureSeedSessions()` reads the `initial-seeds` marker from `session_bootstrap`. Only when the marker is absent, it inserts starter rows with `INSERT OR IGNORE` and `is_seed = 1`, then writes the marker in the same D1 batch. A later request sees the marker and performs no seed insert, so deleted seed rows never reappear.

Create `src/server/worker.ts`. Preserve `/api/admin/session`, `/api/admin/sign-in`, `/api/admin/sign-out`, and static-asset SPA fallback exactly. Before all session requests call `await store.ensureSeedSessions(SEED_SESSIONS)`. Route `GET /api/sessions` publicly; require `await isAdmin(request)` for `POST`, `PUT`, `DELETE`, and import. Respond with JSON `{ sessions }`, `{ session }`, `{ imported }`, `{ error }`, or an empty `204` deletion response.

- [ ] **Step 5: Bundle the real worker in the existing build**

Replace the generated template string in `scripts/create-sites-worker.mjs` with a Vite SSR bundle of `src/server/worker.ts` into `dist/server/index.js`. Keep the current `dist/.openai/hosting.json` copy step. Configure the worker bundle as one ESM entry named `index.js` so it can import `SEED_SESSIONS` at build time without runtime source imports.

- [ ] **Step 6: Verify GREEN and inspect the migration**

Run:

```bash
npm run test:session-worker
npm run test:admin
npm run build
npm run test:sites-build
```

Expected: all tests pass, `dist/server/index.js` exists, `dist/.openai/hosting.json` declares `DB`, and the package contains the generated `drizzle/` migration.

- [ ] **Step 7: Commit**

```bash
git add .openai/hosting.json db drizzle drizzle.config.ts package.json package-lock.json scripts/create-sites-worker.mjs src/server tests/sessionWorker.test.ts
git commit -m "feat: add shared session API"
```

### Task 3: Connect the Class Builder and My Sessions to the shared API

**Files:**
- Create: `src/sessionApi.ts`
- Create: `tests/sessionApi.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/SessionsPage.tsx`
- Modify: `src/sessions.css`
- Modify: `tests/visualContract.test.mjs`
- Modify: `package.json`

**Interfaces:**

```ts
export class SessionApiError extends Error {
  readonly status: number
}
export function listSharedSessions(): Promise<SessionPlan[]>
export function createSharedSession(session: SessionPlan): Promise<SessionPlan>
export function importSharedSessions(sessions: SessionPlan[]): Promise<SessionPlan[]>
export function deleteSharedSession(id: string): Promise<void>

export type SessionSyncState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }
```

`App` passes these callbacks into `BuilderPage` and `SessionsPage`; neither child writes `localStorage` or calls the shared API directly.

- [ ] **Step 1: Write the failing client API tests**

Create `tests/sessionApi.test.ts`, replace `globalThis.fetch` with a mock, and assert:

```ts
test('lists public shared sessions with credentials included', async () => {
  await listSharedSessions()
  assert.deepEqual(calls[0], { url: '/api/sessions', method: 'GET', credentials: 'same-origin' })
})

test('throws SessionApiError for a failed mutation', async () => {
  fetch = async () => new Response(JSON.stringify({ error: 'Administrator access required.' }), { status: 401 })
  await assert.rejects(() => createSharedSession(validSession), SessionApiError)
})
```

Add:

```json
"test:session-api": "node --experimental-strip-types --test tests/sessionApi.test.ts"
```

- [ ] **Step 2: Run the client API test to verify RED**

Run: `npm run test:session-api`

Expected: FAIL because `src/sessionApi.ts` does not exist.

- [ ] **Step 3: Implement the API client**

In `src/sessionApi.ts`, call every endpoint with `credentials: 'same-origin'`; use JSON request headers and bodies for writes. Parse non-2xx JSON `{ error }` messages into `SessionApiError`, use `Unexpected session response.` when the body has no string error, and validate successful payloads with `isSessionPlan` before returning them.

- [ ] **Step 4: Replace App's local session authority**

In `App.tsx`:

- Remove `loadSessions`, `saveSessions`, `SESSIONS_KEY`, and `DELETED_SEEDS_KEY` from the authoritative render path.
- Initialize `sessions` as `[]`, `sessionSync` as `{ status: 'loading' }`, and `legacySessions` from `parseLegacySessions(localStorage.getItem('okojitsu_sessions'), new Set(SEED_SESSIONS.map(session => session.id)))`.
- Add `refreshSessions()` that calls `listSharedSessions`, replaces `sessions` only on success, and moves `sessionSync` to ready/error with a retryable message.
- Call `refreshSessions()` on first mount.
- Change BuilderPage's save dependency to `onCreateSession(plan): Promise<void>`; clear its selected games and form only after the promise resolves.
- Pass `onDeleteSession(id): Promise<void>` to SessionsPage. It calls `deleteSharedSession`, removes that id from state only after success, then refreshes the active selection.
- Add `publishLocalSessions()` for admins. It calls `importSharedSessions(legacySessions)`, refreshes the shared list, and removes `okojitsu_sessions` plus `okojitsu_deleted_seeds` only after success.

- [ ] **Step 5: Add shared state and migration UI**

In `SessionsPage.tsx`, add props for `sync`, `onRetry`, `legacySessionCount`, and `onPublishLocalSessions`. Render:

- A loading panel before a shared response has returned.
- An error panel with a 44px **Retry shared sessions** button when `sync.status === 'error'`.
- An administrator-only import panel when `legacySessionCount > 0`, labelled **Publish local sessions**, explaining that it makes the named count available in every browser.
- A visible `N shared sessions` result count when ready.

Update `sessions.css` for the panels using existing borders, black surfaces, acid-green status copy, and responsive 44px buttons. Add visual-contract assertions for the labelled publish/retry controls and the 44px minimums.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm run test:shared-sessions
npm run test:session-api
npm run test:session-worker
npm run test:admin
npm run test:sessions
npm run test:visual-contract
npm run build
npm run test:sites-build
```

Expected: all tests pass and the production build produces both client and worker output.

- [ ] **Step 7: Commit**

```bash
git add package.json src/App.tsx src/SessionsPage.tsx src/sessionApi.ts src/sessions.css tests/sessionApi.test.ts tests/visualContract.test.mjs
git commit -m "feat: sync sessions across browsers"
```

### Task 4: Validate the migration and prepare the public release

**Files:**
- Modify only if verification exposes a concrete defect in files from Tasks 1–3.

**Interfaces:**

- Consumes the completed shared API, App callbacks, and packaged D1 migration.
- Produces verified source ready for a separately approved public deployment.

- [ ] **Step 1: Run the complete automated suite**

Run every existing package test script plus the new shared-session scripts:

```bash
npm run test:admin
npm run test:field-manual
npm run test:library
npm run test:sessions
npm run test:shared-sessions
npm run test:session-api
npm run test:session-worker
npm run test:visual-contract
npm run test:sites-build
npm run build
```

Expected: every command exits successfully.

- [ ] **Step 2: Inspect the exact release contents**

Run:

```bash
git diff --check
find drizzle -type f -maxdepth 2 -print
/home/jhank/.codex/plugins/cache/openai-bundled/sites/0.1.43/scripts/package-site.sh . /tmp/okojitsu-shared-sessions.tar.gz
tar -tzf /tmp/okojitsu-shared-sessions.tar.gz
```

Confirm the archive contains `dist/server/index.js`, `dist/.openai/hosting.json`, and the generated `dist/.openai/drizzle/` migration files.

- [ ] **Step 3: Perform the two-browser acceptance test after deployment approval**

1. In browser A, sign in as administrator and save a uniquely named class.
2. In browser B, open My Sessions and confirm the class appears after loading shared sessions.
3. In browser A that holds old local classes, use **Publish local sessions** and verify they appear in browser B without duplicates.
4. Delete the uniquely named class as administrator and verify it disappears in browser B after refresh.
