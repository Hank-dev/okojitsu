# Live Session Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add the existing live-game-draft collaboration model to unfinished session plans and publish a completed plan to the shared session collection.

**Architecture:** A revisioned \`session_drafts\` D1 table stores admin-only session drafts separately from public \`sessions\`. The Worker, browser API, and hook mirror the existing game-draft routes, retry behavior, autosave delay, and one-second refresh. App state owns the active draft and makes its list available in Class Builder and My Sessions.

**Tech Stack:** React 19, TypeScript, Cloudflare Worker, D1, Drizzle migrations, Node test runner.

**Spec:** \`docs/superpowers/specs/2026-08-26-live-session-drafts-design.md\`

## Global Constraints

- Only administrators can access drafts; public visitors see only published sessions.
- Opening Class Builder alone must not create a draft.
- A copied session is always a new draft with a new final session id.
- Preserve the live game draft timing: 400 ms autosave and 1,000 ms polling.
- Scalar fields and the ordered games list are distinct patch paths; simultaneous writes to the same path use the latest accepted revision.
- Validate with the full build and complete test suite before public deployment.

---

### Task 1: Define the shared session-draft contract

**Files:**
- Create: \`src/sharedSessionDrafts.ts\`
- Test: \`tests/sessionDrafts.test.ts\`

**Interfaces:**
- Produces \`SessionDraft\`, \`SessionDraftSummary\`, \`SessionDraftPatchPath\`, and \`SessionDraftPatch\`.
- Produces \`createBlankSessionDraft\`, \`createSessionDraftFromSession\`, \`isSessionDraft\`, \`isSessionDraftPatch\`, \`applySessionDraftPatches\`, and \`mergeRemoteSessionDraft\`.
- Consumed by all later tasks.

- [ ] **Step 1: Write the failing contract tests**

\`\`\`ts
test('creates a valid blank session draft and derives duration from games', () => {
  const draft = createBlankSessionDraft('draft-1')
  const updated = applySessionDraftPatches(draft, [{
    path: 'games', value: [{ gameId: 'guard-game', duration: 6 }],
  }])
  assert.equal(updated.session.duration, 6)
  assert.equal(isSessionDraft(updated), true)
})

test('preserves an active title while accepting another editor’s focus update', () => {
  const local = applySessionDraftPatches(createBlankSessionDraft('draft-1'), [{ path: 'title', value: 'Typing' }])
  const remote = { ...local, revision: 2, session: { ...local.session, focus: 'Passing' } }
  assert.equal(mergeRemoteSessionDraft(local, remote, 'title').session.title, 'Typing')
  assert.equal(mergeRemoteSessionDraft(local, remote, 'title').session.focus, 'Passing')
})
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node --experimental-strip-types --test tests/sessionDrafts.test.ts\`

Expected: FAIL because \`sharedSessionDrafts.ts\` does not exist.

- [ ] **Step 3: Implement the contract**

\`\`\`ts
export interface SessionDraft {
  id: string
  session: SessionPlan
  revision: number
  isPublishing: boolean
  createdAt: string
  updatedAt: string
}

export type SessionDraftPatch =
  | { path: 'title' | 'level' | 'focus' | 'notes'; value: string }
  | { path: 'games'; value: SessionGame[] }
\`\`\`

Clone the session and every game slot. Keep \`session.id\` and \`session.date\`
stable. Reject duplicate game ids and invalid durations; derive
\`session.duration\` from games. Model the currently active editable path exactly
like \`mergeRemoteDraft\` in \`sharedGameDrafts.ts\`.

- [ ] **Step 4: Verify GREEN**

Run: \`node --experimental-strip-types --test tests/sessionDrafts.test.ts\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add src/sharedSessionDrafts.ts tests/sessionDrafts.test.ts
git commit -m "feat: define live session drafts"
\`\`\`

### Task 2: Add D1 storage and Worker routes

**Files:**
- Create: \`src/server/sessionDraftStore.ts\`
- Create: generated \`drizzle/0003_*.sql\` and metadata
- Modify: \`src/server/worker.ts\`
- Test: \`tests/sessionDraftStore.test.ts\`
- Test: \`tests/sessionDraftWorker.test.ts\`

**Interfaces:**
- Produces \`SessionDraftStore\` with \`list/get/create/replaceIfRevision/deleteIfRevision/delete\`.
- Produces admin-only \`/api/session-drafts\` collection/item/publish routes.

- [ ] **Step 1: Write failing persistence and Worker tests**

\`\`\`ts
test('revision-replaces a stored session draft', async () => {
  const store = new D1SessionDraftStore(new MemoryD1())
  const draft = await store.create(createBlankSessionDraft('draft-1'))
  assert.ok(draft)
  assert.equal((await store.replaceIfRevision(draft, 0))?.revision, 1)
})

test('rejects every live session draft route for visitors', async () => {
  const { worker } = makeWorker(false)
  assert.equal((await worker.fetch(request('/api/session-drafts'))).status, 401)
})
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node --import tsx --test tests/sessionDraftStore.test.ts tests/sessionDraftWorker.test.ts\`

Expected: FAIL because the new store and routes are absent.

- [ ] **Step 3: Add migration and D1 store**

Generate a \`session_drafts\` table and updated-at index:

\`\`\`sql
CREATE TABLE \`session_drafts\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`payload_json\` text NOT NULL,
  \`revision\` integer DEFAULT 0 NOT NULL,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX \`idx_session_drafts_updated_at\` ON \`session_drafts\` (\`updated_at\`);
\`\`\`

Copy the parsing, optimistic replacement, and timestamp behavior of
\`D1GameDraftStore\`, but summarize \`draft.session.title\`.

- [ ] **Step 4: Mirror game-draft route ownership in the Worker**

Add optional \`sessionDraftStore\` dependency and route helpers:
\`isSessionDraftRoute\`, item-id parsing, editing/publishing claim helpers, and
three-attempt revision retry. Endpoint behavior:

\`\`\`ts
GET    /api/session-drafts
POST   /api/session-drafts
GET    /api/session-drafts/:id
PATCH  /api/session-drafts/:id
POST   /api/session-drafts/:id/publish
DELETE /api/session-drafts/:id
\`\`\`

Publishing must require at least one game and \`isSessionPlan(draft.session)\`,
call \`SessionStore.create(draft.session)\`, then delete only the claimed draft
revision. Return 409 for duplicate final ids, active publishing claims, and
exhausted revision retries without deleting the draft.

- [ ] **Step 5: Verify GREEN**

Run: \`node --import tsx --test tests/sessionDraftStore.test.ts tests/sessionDraftWorker.test.ts\`

Expected: PASS for authorization, list, create, patch retry, publish, and discard.

- [ ] **Step 6: Commit**

\`\`\`bash
git add src/server/sessionDraftStore.ts src/server/worker.ts drizzle tests/sessionDraftStore.test.ts tests/sessionDraftWorker.test.ts
git commit -m "feat: persist live session drafts"
\`\`\`

### Task 3: Copy the live-game browser synchronization layer

**Files:**
- Create: \`src/sessionDraftApi.ts\`
- Create: \`src/useLiveSessionDraft.ts\`
- Test: \`tests/sessionDraftApi.test.ts\`
- Test: \`tests/liveSessionSync.test.mjs\`

**Interfaces:**
- Produces fetch/create/get/patch/publish/delete session-draft functions.
- Produces \`useLiveSessionDraft(initial, onPublished)\` returning the same
  status, retry, close, publish, discard, field-focus, and update API as
  \`useLiveGameDraft\`.

- [ ] **Step 1: Write failing API and timing tests**

\`\`\`ts
test('uses same-origin session-draft endpoints', async () => {
  await createSessionDraft(createBlankSessionDraft('draft-1'))
  await patchSessionDraft('draft-1', [{ path: 'title', value: 'Friday' }])
  assert.deepEqual(calls.map(call => call.url), [
    '/api/session-drafts', '/api/session-drafts/draft-1',
  ])
})
\`\`\`

\`\`\`js
test('uses the established live-draft save and refresh timing', async () => {
  const hook = await readFile(new URL('../src/useLiveSessionDraft.ts', import.meta.url), 'utf8')
  assert.match(hook, /saveDelayMs: 400/)
  assert.match(hook, /pollIntervalMs: 1000/)
})
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node --experimental-strip-types --test tests/sessionDraftApi.test.ts tests/liveSessionSync.test.mjs\`

Expected: FAIL because neither client module exists.

- [ ] **Step 3: Copy, do not alter, the existing collaboration lifecycle**

Copy \`gameDraftApi.ts\` with session draft route and type substitutions. Copy
\`useLiveGameDraft.ts\` to \`useLiveSessionDraft.ts\` with session draft API and
types. Preserve the pending patch map, 404 terminal handling, active-path merge,
idempotent close/publish promises, retry behavior, 400 ms debounce, and 1 s
poll. The publish callback returns the saved \`SessionPlan\`.

- [ ] **Step 4: Verify GREEN**

Run: \`node --experimental-strip-types --test tests/sessionDraftApi.test.ts tests/liveSessionSync.test.mjs\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add src/sessionDraftApi.ts src/useLiveSessionDraft.ts tests/sessionDraftApi.test.ts tests/liveSessionSync.test.mjs
git commit -m "feat: sync live session drafts"
\`\`\`

### Task 4: Build the live Session Builder workbench

**Files:**
- Modify: \`src/App.tsx\`
- Modify: \`src/SessionsPage.tsx\`
- Modify: \`src/index.css\`
- Modify: \`src/sessions.css\`
- Test: \`tests/visualContract.test.mjs\`

**Interfaces:**
- Consumes the draft summaries and hook from Tasks 1-3.
- Produces admin-only **Live session drafts**, **Start a shared session**,
  **Open draft**, **Publish session**, **Discard draft**, and saving status.

- [ ] **Step 1: Write the failing UI contract**

\`\`\`js
test('exposes the live session draft workbench to administrators', () => {
  assert.match(app, /Start a shared session/)
  assert.match(app, /Live session drafts/)
  assert.match(app, /useLiveSessionDraft/)
  assert.match(sessionsPage, /Live session drafts/)
})
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`node tests/visualContract.test.mjs\`

Expected: FAIL because the live session workbench is not rendered.

- [ ] **Step 3: Lift draft list and selection state into App**

Poll \`fetchSessionDrafts\` only for admins. Add \`startLiveSessionDraft\`,
\`openLiveSessionDraft\`, and terminal callbacks that refresh draft summaries
and published sessions. Route session copies through
\`createSessionDraftFromSession\` so they create a new published id instead of
overwriting the source session.

- [ ] **Step 4: Bind the existing builder to the active draft**

When no draft is selected, render the draft list and **Start a shared session**.
When selected, key the workbench by draft id, call \`useLiveSessionDraft\`, and
replace local title/level/focus/notes/slots setters with patches. Bind game
add/remove/duration/reorder, suggestions, and generator output to the draft.
Replace save with **Publish session** and add **Discard draft** and **Back to
live drafts**. Keep the live game creation action unchanged.

- [ ] **Step 5: Make live drafts discoverable in My Sessions**

Render the same compact admin-only summary list above the session browser.
Each row opens the draft in Class Builder. Use line-based styling, 44px actions,
visible focus styles, and mobile stacking; visitors receive no draft UI.

- [ ] **Step 6: Verify GREEN**

Run: \`node tests/visualContract.test.mjs\`

Expected: PASS.

- [ ] **Step 7: Commit**

\`\`\`bash
git add src/App.tsx src/SessionsPage.tsx src/index.css src/sessions.css tests/visualContract.test.mjs
git commit -m "feat: add live session draft workbench"
\`\`\`

### Task 5: Generate migration, verify, and deploy

**Files:**
- Verify: all changed source, migrations, and tests.

- [ ] **Step 1: Generate and inspect the migration**

Run: \`npm run db:generate\`

Expected: the next sequential migration and metadata describe only
\`session_drafts\` plus its updated-at index.

- [ ] **Step 2: Run focused tests**

Run: \`node --experimental-strip-types --import tsx --test tests/sessionDrafts.test.ts tests/sessionDraftStore.test.ts tests/sessionDraftWorker.test.ts tests/sessionDraftApi.test.ts tests/liveSessionSync.test.mjs tests/visualContract.test.mjs\`

Expected: PASS with zero failures.

- [ ] **Step 3: Build and run the full suite sequentially**

Run: \`npm run build\`

Then run: \`node --experimental-strip-types --import tsx --test tests/*.ts tests/*.mjs\`

Expected: build succeeds and every test file passes. Keep these sequential
because \`tests/sitesBuild.test.mjs\` reads completed \`dist/\` artifacts.

- [ ] **Step 4: Commit final migration and source**

\`\`\`bash
git add drizzle src tests docs
git commit -m "feat: collaborate on live session drafts"
\`\`\`

- [ ] **Step 5: Deploy**

Push the exact validated branch head, package the existing build with
\`package-site.sh\`, save a Sites version, deploy to the already approved public
site, poll to success, and reuse the existing site browser tab.

