# Live Draft Client Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale live-draft snapshots and stale Live drafts list fetch responses from regressing client state while preserving the existing draft editing, save queue, focus, lifecycle, and terminal semantics.

**Architecture:** Keep revision ordering at the client snapshot merge boundary so both save and poll responses share one lower-revision guard. Protect the Library page's list state with a request-generation lifecycle token: each fetch captures the current admin lifecycle and request generation, and only the latest still-active request may commit data or errors. Existing active-draft request ordering remains separate.

**Tech Stack:** React 19 hooks, TypeScript strict mode, Vite, Node's built-in test runner with `--experimental-strip-types` and source-contract tests.

**Spec:** `/home/jhank/Documents/Codex/2026-08-12/kojitsu-4lyfe-sites-project-appgprj-6a6e1d9daa988191b711b4d724a475fa/work/source/.worktrees/live-game-drafts/.superpowers/sdd/2026-08-24-live-game-drafts/task-4-report.md` plus the final-review remediation requirements supplied with this task.

## Global Constraints

- Work only in `/home/jhank/Documents/Codex/2026-08-12/kojitsu-4lyfe-sites-project-appgprj-6a6e1d9daa988191b711b4d724a475fa/work/source/.worktrees/live-draft-client-remediation` for implementation files.
- Base remains `1cd58cc6dd3ba38e88445813a9f3e6963fd3fadc` on `fix/live-draft-client-remediation`.
- Do not touch server stores, routes, schema, migrations, browser persistence, WebSocket, CRDT, or user-presence behavior.
- Do not add or update dependencies or lockfiles; run `npm install` only if `node_modules` is missing (it is present at baseline).
- No subagents, push, deploy, publish, or external coordination.
- Add focused regressions and capture meaningful RED before production changes; then run focused tests, relevant full tests, typecheck, and build.
- Preserve pending local patches, active-field focus protection, queue flushing, lifecycle cleanup, and terminal-state behavior.

### Task 1: Reject lower-revision live draft snapshots

**Files:**
- Modify: `src/useLiveGameDraft.ts` in `mergeLiveGameDraft`
- Test: `tests/gameDrafts.test.ts`

**Interfaces:**
- Consumes: `GameDraft.revision`, existing `mergeLiveGameDraft(local, remote, activePath, pendingPatches)` contract.
- Produces: the same merged draft contract, with any `remote.revision < local.revision` snapshot ignored so save and poll callers cannot regress an accepted snapshot.

- [ ] **Step 1: Write the failing save-vs-poll regression**

  Add one focused test that accepts a revision-2 remote snapshot, then applies a delayed revision-1 save snapshot through `mergeLiveGameDraft`. Assert the revision-2 fields and revision remain unchanged, while a pending local patch/focus merge still remains covered by the existing tests.

- [ ] **Step 2: Run the focused test to verify RED**

  Run:

  ```bash
  node --experimental-strip-types --test tests/gameDrafts.test.ts
  ```

  Expected: the new stale-response assertion fails because the current merge unconditionally clones the lower-revision remote snapshot; existing tests should remain green.

- [ ] **Step 3: Implement the minimal revision guard**

  At the start of `mergeLiveGameDraft`, return the current local draft when `remote.revision < local.revision`; otherwise retain the existing `mergeRemoteDraft` and pending-patch reapplication logic unchanged.

- [ ] **Step 4: Run the focused test to verify GREEN**

  Run:

  ```bash
  node --experimental-strip-types --test tests/gameDrafts.test.ts
  ```

  Expected: all tests in the focused file pass, including the stale save-vs-poll regression and the existing focus/queue/terminal regressions.

### Task 2: Make Live drafts list refresh latest-request-wins

**Files:**
- Modify: `src/App.tsx` in `LibraryPage` Live drafts refresh lifecycle
- Test: `tests/visualContract.test.mjs` (source contract for ordering and cleanup guards)

**Interfaces:**
- Consumes: existing `fetchGameDrafts`, `isAdmin`, `refreshLiveDrafts`, interval, admin-change cleanup, and `liveDraftRequestIdRef` behavior.
- Produces: refreshes whose older data/error completions cannot commit after a newer request or after unmount/admin deactivation; manual retries and post-create refreshes remain callable through the same `refreshLiveDrafts` callback.

- [ ] **Step 1: Write the failing source-contract regression**

  Add assertions against the `LibraryPage` source requiring a dedicated list-refresh generation/lifecycle guard, a captured request token checked before both success and error state writes, and cleanup invalidation on effect cleanup/admin deactivation. The baseline source should fail because it currently commits every fetch completion and cleanup only clears the interval.

- [ ] **Step 2: Run the focused source-contract test to verify RED**

  Run:

  ```bash
  node --test tests/visualContract.test.mjs
  ```

  Expected: the new Live drafts refresh-ordering assertion fails on the baseline `refreshLiveDrafts` implementation.

- [ ] **Step 3: Implement the minimal latest-request-wins lifecycle guard**

  Add a list-refresh generation ref separate from active-draft opening requests. Capture an incremented generation and the current admin lifecycle for each refresh; before applying either fetched drafts or an error, require that the component is still active for that admin lifecycle and that the captured generation is current. In the effect, invalidate the lifecycle/generation before interval cleanup and when `isAdmin` becomes false, so in-flight completions cannot update state after cleanup. Keep interval cadence and existing UI error behavior intact.

- [ ] **Step 4: Run the focused source-contract test to verify GREEN**

  Run:

  ```bash
  node --test tests/visualContract.test.mjs
  ```

  Expected: the new contract passes and all existing visual/source contracts pass.

### Task 3: Full validation and atomic handoff

**Files:**
- Modify: none beyond Tasks 1–2 and this plan/report artifacts.

- [ ] **Step 1: Run focused client tests**

  ```bash
  node --experimental-strip-types --test tests/gameDrafts.test.ts tests/gameDraftApi.test.ts
  node --test tests/visualContract.test.mjs
  ```

- [ ] **Step 2: Run typecheck and relevant full suite**

  ```bash
  npx tsc --noEmit
  node --import tsx --test tests/*.test.ts tests/*.test.mjs
  ```

- [ ] **Step 3: Run the production build**

  ```bash
  npm run build
  ```

- [ ] **Step 4: Review scope, diff, and test evidence**

  Confirm only client/test/plan files changed in the implementation worktree, no dependency or lockfile changes occurred, and the existing large-client-chunk warning (if present) is non-blocking.

- [ ] **Step 5: Commit the remediation atomically**

  ```bash
  git add src/useLiveGameDraft.ts src/App.tsx tests/gameDrafts.test.ts tests/visualContract.test.mjs docs/superpowers/plans/2026-08-25-live-draft-client-remediation.md
  git commit -m "fix: prevent stale live draft responses"
  ```

  Write the final report to the requested sibling `.superpowers/sdd/2026-08-24-live-game-drafts/final-client-remediation-report.md` path, using the corrected `...9daa...` directory because the user-provided `...9baa...` path is unavailable.
